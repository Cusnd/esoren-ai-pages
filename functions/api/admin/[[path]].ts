import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  contentPath,
  isFrontmatterRecord,
  normalizeContentInput,
  serializeMarkdown,
  type AdminCollection,
  type FrontmatterRecord,
  type NormalizedContentItem
} from "../../../src/lib/admin-content";

type D1Value = string | number | boolean | null;

type D1Result<T> = {
  results?: T[];
};

type D1PreparedStatement = {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type PagesContext<Bindings, Param extends string> = {
  request: Request;
  env: Bindings;
  params: Record<Param, string | string[]>;
};

type PagesFunction<Bindings, Param extends string> = (
  context: PagesContext<Bindings, Param>
) => Response | Promise<Response>;

type Env = {
  ADMIN_DB: D1Database;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ADMIN_EMAIL: string;
  DEPLOY_HOOK_URL?: string;
};

type AuthedUser = {
  email: string;
};

type ContentListRow = {
  id: string;
  collection: AdminCollection;
  slug: string;
  title: string;
  status: string;
  version: number;
  updated_at: string;
  published_at: string | null;
  published_commit_sha: string | null;
};

type ContentRow = ContentListRow & {
  frontmatter_json: string;
  body_markdown: string;
};

type RevisionRow = {
  id: string;
  item_id: string;
  version: number;
  actor_email: string;
  action: string;
  created_at: string;
};

type PublishJobRow = {
  id: string;
  item_id: string;
  status: "running" | "succeeded" | "failed";
  commit_sha: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

type GitHubContentResponse = {
  sha?: unknown;
};

type GitHubPutResponse = {
  commit?: {
    sha?: unknown;
  };
};

const maxJsonBytes = 512_000;
const githubApiVersion = "2026-03-10";

export const onRequest: PagesFunction<Env, "path"> = async (context) => {
  try {
    const user = await authenticate(context.request, context.env);
    const url = new URL(context.request.url);
    const segments = normalizeSegments(context.params.path);

    if (segments.length === 0) {
      return jsonResponse({ ok: true, service: "admin-api", email: user.email });
    }

    if (segments[0] === "content") {
      return handleContentRoute(context.request, context.env, user, segments.slice(1), url);
    }

    if (segments[0] === "publish-jobs") {
      return handlePublishJobRoute(context.request, context.env, segments.slice(1));
    }

    return jsonError("Not found.", 404);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Internal server error.";
    if (status >= 500) {
      console.error(JSON.stringify({ message: "admin api error", error: message }));
    }
    return jsonError(status >= 500 ? "Internal server error." : message, status);
  }
};

async function handleContentRoute(
  request: Request,
  env: Env,
  user: AuthedUser,
  segments: string[],
  url: URL
): Promise<Response> {
  if (segments.length === 0 && request.method === "GET") {
    const collection = url.searchParams.get("collection");
    const items = await listContent(env.ADMIN_DB, collection);
    if (url.searchParams.get("includeFirst") === "1" && items[0]) {
      const item = await getContent(env.ADMIN_DB, items[0].id);
      const revisions = item ? await listRevisions(env.ADMIN_DB, item.id) : [];
      if (item) return jsonResponse({ items, selected: { item, revisions } });
    }
    return jsonResponse({ items });
  }

  if (segments.length === 0 && request.method === "POST") {
    const payload = await readJson(request);
    const normalized = normalizeContentInput(payload);
    if (!normalized.ok) return jsonResponse({ errors: normalized.errors }, { status: 422 });

    const item = await createContent(env.ADMIN_DB, normalized.value, user.email);
    return jsonResponse({ item }, { status: 201 });
  }

  if (segments.length === 1 && request.method === "GET") {
    const item = await getContent(env.ADMIN_DB, segments[0]);
    if (!item) return jsonError("Content item not found.", 404);
    const revisions = await listRevisions(env.ADMIN_DB, item.id);
    return jsonResponse({ item, revisions });
  }

  if (segments.length === 1 && request.method === "PATCH") {
    const existing = await getContent(env.ADMIN_DB, segments[0]);
    if (!existing) return jsonError("Content item not found.", 404);

    const payload = await readJson(request);
    const normalized = normalizeContentInput(payload);
    if (!normalized.ok) return jsonResponse({ errors: normalized.errors }, { status: 422 });

    const item = await updateContent(env.ADMIN_DB, existing.id, normalized.value, existing.version, user.email);
    return jsonResponse({ item });
  }

  if (segments.length === 2 && segments[1] === "publish" && request.method === "POST") {
    const item = await getContent(env.ADMIN_DB, segments[0]);
    if (!item) return jsonError("Content item not found.", 404);

    const job = await publishContent(env, item, user.email);
    return jsonResponse({ job });
  }

  return jsonError("Not found.", 404);
}

async function handlePublishJobRoute(request: Request, env: Env, segments: string[]): Promise<Response> {
  if (request.method !== "GET" || segments.length !== 1) {
    return jsonError("Not found.", 404);
  }

  const job = await env.ADMIN_DB.prepare(
    `SELECT id, item_id, status, commit_sha, error_message, created_at, finished_at
       FROM publish_jobs
      WHERE id = ?1`
  )
    .bind(segments[0])
    .first<PublishJobRow>();

  if (!job) return jsonError("Publish job not found.", 404);
  return jsonResponse({ job });
}

async function authenticate(request: Request, env: Env): Promise<AuthedUser> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new HttpError("Missing Cloudflare Access JWT.", 401);

  const required = ["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "ADMIN_EMAIL"] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new HttpError(`Missing admin auth configuration: ${missing.join(", ")}.`, 500);
  }

  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: teamDomain,
    audience: env.CF_ACCESS_AUD
  });

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email !== env.ADMIN_EMAIL.trim().toLowerCase()) {
    throw new HttpError("Authenticated user is not authorized for this admin API.", 403);
  }

  return { email };
}

async function listContent(db: D1Database, collectionParam: string | null): Promise<ContentListRow[]> {
  const collection = collectionParam && isKnownCollection(collectionParam) ? collectionParam : null;
  const statement =
    collection === null
      ? db.prepare(
          `SELECT id, collection, slug, title, status, version, updated_at, published_at, published_commit_sha
             FROM content_items
            ORDER BY updated_at DESC
            LIMIT 250`
        )
      : db
          .prepare(
            `SELECT id, collection, slug, title, status, version, updated_at, published_at, published_commit_sha
               FROM content_items
              WHERE collection = ?1
              ORDER BY updated_at DESC
              LIMIT 250`
          )
          .bind(collection);

  const result = await statement.all<ContentListRow>();
  return result.results ?? [];
}

async function createContent(db: D1Database, item: NormalizedContentItem, actorEmail: string): Promise<ContentRow> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO content_items
        (id, collection, slug, title, status, frontmatter_json, body_markdown, version, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)`
    )
    .bind(
      id,
      item.collection,
      item.slug,
      item.title,
      item.status,
      JSON.stringify(item.frontmatter),
      item.body,
      now
    )
    .run();

  const created = await getContent(db, id);
  if (!created) throw new HttpError("Failed to create content item.", 500);
  await insertRevision(db, created, actorEmail, "create");
  return created;
}

async function updateContent(
  db: D1Database,
  id: string,
  item: NormalizedContentItem,
  previousVersion: number,
  actorEmail: string
): Promise<ContentRow> {
  const now = new Date().toISOString();
  const nextVersion = previousVersion + 1;

  await db
    .prepare(
      `UPDATE content_items
          SET collection = ?1,
              slug = ?2,
              title = ?3,
              status = ?4,
              frontmatter_json = ?5,
              body_markdown = ?6,
              version = ?7,
              updated_at = ?8
        WHERE id = ?9`
    )
    .bind(
      item.collection,
      item.slug,
      item.title,
      item.status,
      JSON.stringify(item.frontmatter),
      item.body,
      nextVersion,
      now,
      id
    )
    .run();

  const updated = await getContent(db, id);
  if (!updated) throw new HttpError("Failed to update content item.", 500);
  await insertRevision(db, updated, actorEmail, "update");
  return updated;
}

async function getContent(db: D1Database, id: string): Promise<ContentRow | null> {
  return db
    .prepare(
      `SELECT id, collection, slug, title, status, frontmatter_json, body_markdown, version, updated_at, published_at, published_commit_sha
         FROM content_items
        WHERE id = ?1`
    )
    .bind(id)
    .first<ContentRow>();
}

async function listRevisions(db: D1Database, itemId: string): Promise<RevisionRow[]> {
  const result = await db
    .prepare(
      `SELECT id, item_id, version, actor_email, action, created_at
         FROM content_revisions
        WHERE item_id = ?1
        ORDER BY created_at DESC
        LIMIT 20`
    )
    .bind(itemId)
    .all<RevisionRow>();

  return result.results ?? [];
}

async function insertRevision(db: D1Database, item: ContentRow, actorEmail: string, action: string): Promise<void> {
  const now = new Date().toISOString();
  const snapshot = {
    id: item.id,
    collection: item.collection,
    slug: item.slug,
    title: item.title,
    status: item.status,
    frontmatter: parseFrontmatter(item.frontmatter_json),
    body: item.body_markdown,
    publishedAt: item.published_at,
    publishedCommitSha: item.published_commit_sha
  };

  await db
    .prepare(
      `INSERT INTO content_revisions
        (id, item_id, version, snapshot_json, actor_email, action, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(crypto.randomUUID(), item.id, item.version, JSON.stringify(snapshot), actorEmail, action, now)
    .run();
}

async function publishContent(env: Env, item: ContentRow, actorEmail: string): Promise<PublishJobRow> {
  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();

  try {
    await env.ADMIN_DB.prepare(
      `INSERT INTO publish_jobs (id, item_id, status, created_at)
       VALUES (?1, ?2, 'running', ?3)`
    )
      .bind(jobId, item.id, now)
      .run();
  } catch {
    throw new HttpError("A publish job is already running for this item.", 409);
  }

  try {
    const frontmatter = parseFrontmatter(item.frontmatter_json);
    const markdown = serializeMarkdown(item.collection, frontmatter, item.body_markdown);
    const path = contentPath(item.collection, item.slug);
    const commitSha = await putGitHubFile(env, path, markdown, `docs: publish ${item.collection}/${item.slug}`);
    const finishedAt = new Date().toISOString();

    await env.ADMIN_DB.prepare(
      `UPDATE publish_jobs
          SET status = 'succeeded',
              commit_sha = ?1,
              finished_at = ?2
        WHERE id = ?3`
    )
      .bind(commitSha, finishedAt, jobId)
      .run();

    await env.ADMIN_DB.prepare(
      `UPDATE content_items
          SET published_at = ?1,
              published_commit_sha = ?2
        WHERE id = ?3`
    )
      .bind(finishedAt, commitSha, item.id)
      .run();

    const publishedItem = await getContent(env.ADMIN_DB, item.id);
    if (publishedItem) {
      await insertRevision(env.ADMIN_DB, publishedItem, actorEmail, "publish");
    }

    if (env.DEPLOY_HOOK_URL) {
      const hookResponse = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
      if (!hookResponse.ok) {
        console.error(
          JSON.stringify({ message: "deploy hook failed", status: hookResponse.status, itemId: item.id })
        );
        await hookResponse.body?.cancel();
      }
    }

    const job = await getPublishJob(env.ADMIN_DB, jobId);
    if (!job) throw new HttpError("Publish job disappeared after completion.", 500);
    return job;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown publish error.";
    const finishedAt = new Date().toISOString();

    await env.ADMIN_DB.prepare(
      `UPDATE publish_jobs
          SET status = 'failed',
              error_message = ?1,
              finished_at = ?2
        WHERE id = ?3`
    )
      .bind(message, finishedAt, jobId)
      .run();

    throw error;
  }
}

async function getPublishJob(db: D1Database, id: string): Promise<PublishJobRow | null> {
  return db
    .prepare(
      `SELECT id, item_id, status, commit_sha, error_message, created_at, finished_at
         FROM publish_jobs
        WHERE id = ?1`
    )
    .bind(id)
    .first<PublishJobRow>();
}

async function putGitHubFile(env: Env, path: string, content: string, message: string): Promise<string> {
  const repo = env.GITHUB_REPO || "Cusnd/esoren-ai-pages";
  const branch = env.GITHUB_BRANCH || "main";
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new HttpError("GITHUB_REPO must use owner/repo format.", 500);
  if (!env.GITHUB_TOKEN) throw new HttpError("Missing GITHUB_TOKEN secret.", 500);

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const baseUrl = `https://api.github.com/repos/${owner}/${name}/contents/${encodedPath}`;
  const existing = await fetch(`${baseUrl}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(env.GITHUB_TOKEN)
  });

  let sha: string | undefined;
  if (existing.status === 200) {
    const data: unknown = await existing.json();
    if (isGitHubContentResponse(data) && typeof data.sha === "string") {
      sha = data.sha;
    }
  } else if (existing.status !== 404) {
    const errorText = await boundedText(existing);
    throw new HttpError(`GitHub file lookup failed: ${existing.status} ${errorText}`, 502);
  } else {
    await existing.body?.cancel();
  }

  const body: Record<string, unknown> = {
    message,
    content: base64Encode(content),
    branch
  };
  if (sha) body.sha = sha;

  const response = await fetch(baseUrl, {
    method: "PUT",
    headers: githubHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await boundedText(response);
    throw new HttpError(`GitHub publish failed: ${response.status} ${errorText}`, 502);
  }

  const data: unknown = await response.json();
  if (!isGitHubPutResponse(data) || typeof data.commit?.sha !== "string") {
    throw new HttpError("GitHub publish response did not include a commit SHA.", 502);
  }

  return data.commit.sha;
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "soren-ai-pages-admin",
    "X-GitHub-Api-Version": githubApiVersion
  };
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxJsonBytes) {
    throw new HttpError("Request body is too large.", 413);
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

async function boundedText(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 800);
}

function parseFrontmatter(value: string): FrontmatterRecord {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isFrontmatterRecord(parsed)) return parsed;
  } catch {
    // handled below
  }
  return {};
}

function normalizeSegments(path: string | string[] | undefined): string[] {
  if (!path) return [];
  return Array.isArray(path) ? path : [path];
}

function normalizeTeamDomain(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}

function isKnownCollection(value: string): value is AdminCollection {
  return value === "articles" || value === "papers" || value === "skills" || value === "mcp";
}

function base64Encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, { status });
}

function isGitHubContentResponse(value: unknown): value is GitHubContentResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGitHubPutResponse(value: unknown): value is GitHubPutResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
