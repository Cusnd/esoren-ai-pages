import {
  adminCollections,
  collectionDefinitions,
  createDefaultFrontmatter,
  slugifyTitle,
  type AdminCollection,
  type FrontmatterRecord
} from "@/lib/admin-content";

type ContentListItem = {
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

type ContentItem = ContentListItem & {
  frontmatter_json: string;
  body_markdown: string;
};

type RevisionItem = {
  id: string;
  item_id: string;
  version: number;
  actor_email: string;
  action: string;
  created_at: string;
};

type PublishJob = {
  id: string;
  item_id: string;
  status: "running" | "succeeded" | "failed";
  commit_sha: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

type AdminState = {
  collection: AdminCollection;
  currentItem: ContentItem | null;
  items: ContentListItem[];
  revisions: RevisionItem[];
};

const app = document.querySelector<HTMLElement>("[data-admin-app]");

if (app) {
  initAdmin(app);
}

function initAdmin(root: HTMLElement) {
  const state: AdminState = {
    collection: "articles",
    currentItem: null,
    items: [],
    revisions: []
  };

  const collectionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-admin-collection]"));
  const countNodes = new Map(
    Array.from(root.querySelectorAll<HTMLElement>("[data-admin-count]")).map((node) => [
      node.dataset.adminCount ?? "",
      node
    ])
  );
  const list = required(root, "[data-admin-list]");
  const search = required<HTMLInputElement>(root, "[data-admin-search]");
  const resultCount = required(root, "[data-admin-result-count]");
  const identity = required(root, "[data-admin-identity]");
  const apiState = required(root, "[data-admin-api-state]");
  const newButton = required<HTMLButtonElement>(root, "[data-admin-new]");
  const saveButton = required<HTMLButtonElement>(root, "[data-admin-save]");
  const publishButton = required<HTMLButtonElement>(root, "[data-admin-publish]");
  const collectionField = required<HTMLSelectElement>(root, "[data-admin-field='collection']");
  const statusField = required<HTMLSelectElement>(root, "[data-admin-field='status']");
  const titleField = required<HTMLInputElement>(root, "[data-admin-field='title']");
  const slugField = required<HTMLInputElement>(root, "[data-admin-field='slug']");
  const frontmatterField = required<HTMLTextAreaElement>(root, "[data-admin-field='frontmatter']");
  const bodyField = required<HTMLTextAreaElement>(root, "[data-admin-field='body']");
  const preview = required(root, "[data-admin-preview]");
  const revisionsNode = required(root, "[data-admin-revisions]");
  const versionNode = required(root, "[data-admin-version]");
  const publishedNode = required(root, "[data-admin-published]");
  const jobState = required(root, "[data-admin-job-state]");
  const jobLog = required(root, "[data-admin-job-log]");

  const setBusy = (busy: boolean, label: string) => {
    saveButton.disabled = busy;
    newButton.disabled = busy;
    publishButton.disabled = busy || !state.currentItem;
    apiState.textContent = label;
  };

  const loadIdentity = async () => {
    try {
      const data = await requestJson<{ email?: string }>("/api/admin");
      identity.textContent = data.email ? data.email : "Access verified";
    } catch (error) {
      identity.textContent = "Access required";
      apiState.textContent = messageFrom(error);
    }
  };

  const loadCollection = async (collection = state.collection) => {
    setBusy(true, "Loading");
    try {
      state.collection = collection;
      collectionField.value = collection;
      syncCollectionButtons(collectionButtons, collection);
      syncStatusOptions(statusField, collection);

      const data = await requestJson<{ items: ContentListItem[] }>(`/api/admin/content?collection=${collection}`);
      state.items = data.items;
      updateCounts(countNodes, collection, data.items.length);
      renderList();

      if (data.items[0]) {
        await selectItem(data.items[0].id);
      } else {
        startNewDraft(collection);
      }

      apiState.textContent = "Ready";
    } catch (error) {
      const message = messageFrom(error);
      startNewDraft(collection);
      list.replaceChildren(emptyState("No saved content.", "Saved drafts appear here."));
      apiState.textContent = message;
    } finally {
      setBusy(false, apiState.textContent || "Ready");
    }
  };

  const renderList = () => {
    const query = search.value.trim().toLowerCase();
    const visible = state.items.filter((item) =>
      `${item.title} ${item.slug} ${item.status}`.toLowerCase().includes(query)
    );

    resultCount.textContent = `${visible.length} ${visible.length === 1 ? "item" : "items"}`;

    if (state.items.length === 0) {
      list.replaceChildren(emptyState("No saved content.", "Saved drafts appear here."));
      return;
    }

    if (visible.length === 0) {
      list.replaceChildren(emptyState("No matching content.", "Search returned no saved entries."));
      return;
    }

    list.replaceChildren(
      ...visible.map((item) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "admin-content-row";
        row.classList.toggle("active", state.currentItem?.id === item.id);
        row.dataset.adminItem = item.id;

        const main = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = item.title;
        const slug = document.createElement("small");
        slug.textContent = `${item.collection}/${item.slug}`;
        main.append(title, slug);

        const meta = document.createElement("span");
        meta.className = "admin-row-meta";
        const status = document.createElement("small");
        status.textContent = item.status;
        const version = document.createElement("small");
        version.textContent = `v${item.version}`;
        meta.append(status, version);

        row.append(main, meta);
        row.addEventListener("click", () => {
          void selectItem(item.id);
        });
        return row;
      })
    );
  };

  const selectItem = async (id: string) => {
    setBusy(true, "Loading item");
    try {
      const data = await requestJson<{ item: ContentItem; revisions: RevisionItem[] }>(`/api/admin/content/${id}`);
      state.currentItem = data.item;
      state.revisions = data.revisions;
      state.collection = data.item.collection;
      fillForm(data.item);
      renderList();
      renderPreview();
      renderRevisions();
      renderPublishState(null);
      apiState.textContent = "Ready";
    } catch (error) {
      apiState.textContent = messageFrom(error);
    } finally {
      setBusy(false, apiState.textContent || "Ready");
    }
  };

  const startNewDraft = (collection = state.collection) => {
    state.collection = collection;
    state.currentItem = null;
    state.revisions = [];

    const frontmatter = createDefaultFrontmatter(collection);
    collectionField.value = collection;
    syncCollectionButtons(collectionButtons, collection);
    syncStatusOptions(statusField, collection);
    fillFields({
      collection,
      slug: slugifyTitle(String(frontmatter.title ?? "")),
      title: String(frontmatter.title ?? ""),
      status: String(frontmatter.status ?? collectionDefinitions[collection].statuses[0]),
      frontmatter,
      body: "Start the note here."
    });
    renderList();
    renderPreview();
    renderRevisions();
    renderPublishState(null);
    publishButton.disabled = true;
    apiState.textContent = "Drafting";
  };

  const saveCurrent = async () => {
    setBusy(true, "Saving");
    try {
      const payload = readFormPayload();
      const endpoint = state.currentItem ? `/api/admin/content/${state.currentItem.id}` : "/api/admin/content";
      const method = state.currentItem ? "PATCH" : "POST";
      const data = await requestJson<{ item: ContentItem }>(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      state.currentItem = data.item;
      state.collection = data.item.collection;
      await loadCollection(data.item.collection);
      await selectItem(data.item.id);
      apiState.textContent = "Saved";
    } catch (error) {
      apiState.textContent = messageFrom(error);
    } finally {
      setBusy(false, apiState.textContent || "Ready");
    }
  };

  const publishCurrent = async () => {
    if (!state.currentItem) return;
    setBusy(true, "Publishing");
    renderPublishState({ status: "running", id: "pending", commit_sha: null, error_message: null });
    try {
      const data = await requestJson<{ job: PublishJob }>(`/api/admin/content/${state.currentItem.id}/publish`, {
        method: "POST"
      });
      renderPublishState(data.job);
      await selectItem(state.currentItem.id);
      apiState.textContent = data.job.status === "succeeded" ? "Published" : data.job.status;
    } catch (error) {
      jobState.textContent = "Failed";
      jobLog.textContent = messageFrom(error);
      apiState.textContent = messageFrom(error);
    } finally {
      setBusy(false, apiState.textContent || "Ready");
    }
  };

  const readFormPayload = () => {
    const collection = collectionField.value as AdminCollection;
    const parsed = JSON.parse(frontmatterField.value) as unknown;
    const frontmatter = isRecord(parsed) ? parsed : {};
    frontmatter.title = titleField.value.trim();
    frontmatter.status = statusField.value;

    return {
      collection,
      slug: slugField.value.trim(),
      frontmatter,
      body: bodyField.value
    };
  };

  const fillForm = (item: ContentItem) => {
    const frontmatter = safeParseFrontmatter(item.frontmatter_json);
    fillFields({
      collection: item.collection,
      slug: item.slug,
      title: item.title,
      status: item.status,
      frontmatter,
      body: item.body_markdown
    });
    versionNode.textContent = `v${item.version}`;
    publishedNode.textContent = item.published_at ? formatDateTime(item.published_at) : "Not published";
    publishButton.disabled = false;
  };

  const fillFields = (data: {
    collection: AdminCollection;
    slug: string;
    title: string;
    status: string;
    frontmatter: FrontmatterRecord;
    body: string;
  }) => {
    collectionField.value = data.collection;
    syncStatusOptions(statusField, data.collection);
    titleField.value = data.title;
    statusField.value = data.status;
    slugField.value = data.slug;
    frontmatterField.value = JSON.stringify(data.frontmatter, null, 2);
    bodyField.value = data.body;
    versionNode.textContent = state.currentItem ? `v${state.currentItem.version}` : "v0";
    publishedNode.textContent = state.currentItem?.published_at
      ? formatDateTime(state.currentItem.published_at)
      : "Not published";
  };

  const renderPreview = () => {
    preview.replaceChildren();
    let frontmatter: FrontmatterRecord = {};
    try {
      const payload = readFormPayload();
      frontmatter = payload.frontmatter;
    } catch {
      frontmatter = {};
    }

    const title = document.createElement("h3");
    title.textContent = titleField.value || "Untitled";

    const meta = document.createElement("p");
    meta.textContent = `${collectionField.value} / ${slugField.value || "slug"} / ${statusField.value}`;

    const summary = document.createElement("p");
    summary.textContent = typeof frontmatter.summary === "string" ? frontmatter.summary : "No summary.";

    const body = document.createElement("pre");
    body.textContent = bodyField.value || "No markdown body.";

    preview.append(title, meta, summary, body);
  };

  const renderRevisions = () => {
    if (state.revisions.length === 0) {
      revisionsNode.replaceChildren(emptyState("No revisions yet."));
      return;
    }

    revisionsNode.replaceChildren(
      ...state.revisions.map((revision) => {
        const row = document.createElement("div");
        row.className = "admin-revision-row";
        const action = document.createElement("strong");
        action.textContent = `${revision.action} v${revision.version}`;
        const meta = document.createElement("small");
        meta.textContent = `${formatDateTime(revision.created_at)} by ${revision.actor_email}`;
        row.append(action, meta);
        return row;
      })
    );
  };

  const renderPublishState = (job: Pick<PublishJob, "id" | "status" | "commit_sha" | "error_message"> | null) => {
    if (!job) {
      jobState.textContent = "Idle";
      jobLog.textContent = "No publish job selected.";
      return;
    }

    jobState.textContent = job.status;
    jobLog.textContent = JSON.stringify(
      {
        id: job.id,
        status: job.status,
        commit: job.commit_sha,
        error: job.error_message
      },
      null,
      2
    );
  };

  collectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const collection = button.dataset.adminCollection;
      if (isAdminCollection(collection)) {
        void loadCollection(collection);
      }
    });
  });

  collectionField.addEventListener("change", () => {
    if (isAdminCollection(collectionField.value)) {
      startNewDraft(collectionField.value);
    }
  });

  titleField.addEventListener("input", () => {
    if (!state.currentItem) slugField.value = slugifyTitle(titleField.value);
    renderPreview();
  });
  slugField.addEventListener("input", renderPreview);
  statusField.addEventListener("change", renderPreview);
  frontmatterField.addEventListener("input", renderPreview);
  bodyField.addEventListener("input", renderPreview);
  search.addEventListener("input", renderList);
  newButton.addEventListener("click", () => startNewDraft(state.collection));
  saveButton.addEventListener("click", () => {
    void saveCurrent();
  });
  publishButton.addEventListener("click", () => {
    void publishCurrent();
  });

  void loadIdentity();
  void loadCollection("articles");
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorText(data, response.status));
  }
  return data as T;
}

function errorText(data: unknown, status: number): string {
  if (isRecord(data)) {
    if (typeof data.error === "string") return data.error;
    if (Array.isArray(data.errors)) return data.errors.filter((item) => typeof item === "string").join(" ");
  }
  if (status === 401 || status === 403) return "Access sign-in required.";
  if (status === 404) return "Admin API unavailable.";
  return `Request failed with status ${status}.`;
}

function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing admin element: ${selector}`);
  return element;
}

function syncCollectionButtons(buttons: HTMLButtonElement[], collection: AdminCollection) {
  buttons.forEach((button) => {
    const active = button.dataset.adminCollection === collection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function syncStatusOptions(select: HTMLSelectElement, collection: AdminCollection) {
  const current = select.value;
  select.replaceChildren(
    ...collectionDefinitions[collection].statuses.map((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      return option;
    })
  );
  if (collectionDefinitions[collection].statuses.includes(current)) {
    select.value = current;
  }
}

function updateCounts(nodes: Map<string, HTMLElement>, collection: AdminCollection, count: number) {
  const node = nodes.get(collection);
  if (node) node.textContent = String(count);
}

function emptyState(message: string, detail?: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "admin-empty";
  const title = document.createElement("strong");
  title.textContent = message;
  node.append(title);
  if (detail) {
    const hint = document.createElement("span");
    hint.textContent = detail;
    node.append(hint);
  }
  return node;
}

function safeParseFrontmatter(value: string): FrontmatterRecord {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    return {};
  }
  return {};
}

function isRecord(value: unknown): value is FrontmatterRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdminCollection(value: unknown): value is AdminCollection {
  return typeof value === "string" && adminCollections.includes(value as AdminCollection);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected admin error.";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}
