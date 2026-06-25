export const adminCollections = ["articles", "papers", "skills", "mcp"] as const;

export type AdminCollection = (typeof adminCollections)[number];
export type FrontmatterRecord = Record<string, unknown>;

export type ContentItemInput = {
  collection: unknown;
  slug: unknown;
  frontmatter: unknown;
  body: unknown;
};

export type NormalizedContentItem = {
  collection: AdminCollection;
  slug: string;
  title: string;
  status: string;
  frontmatter: FrontmatterRecord;
  body: string;
};

type ValidationResult =
  | {
      ok: true;
      value: NormalizedContentItem;
    }
  | {
      ok: false;
      errors: string[];
    };

type CollectionDefinition = {
  statuses: readonly string[];
  requiredArrays: readonly string[];
  requiredNumbers: readonly string[];
  requiredStrings: readonly string[];
  optionalDefaults: FrontmatterRecord;
  preferredOrder: readonly string[];
};

export const collectionDefinitions: Record<AdminCollection, CollectionDefinition> = {
  articles: {
    statuses: ["Draft", "Published", "Updated"],
    requiredArrays: ["tags"],
    requiredNumbers: [],
    requiredStrings: ["title", "date", "status", "summary", "trail"],
    optionalDefaults: {
      relatedPapers: [],
      relatedSkills: [],
      relatedMcp: [],
      links: []
    },
    preferredOrder: [
      "title",
      "date",
      "status",
      "summary",
      "tags",
      "trail",
      "relatedPapers",
      "relatedSkills",
      "relatedMcp",
      "links"
    ]
  },
  papers: {
    statuses: ["To Read", "Reading", "Notes", "Implemented", "Archived"],
    requiredArrays: ["authors", "tags"],
    requiredNumbers: ["year"],
    requiredStrings: ["title", "venue", "status", "summary", "trail"],
    optionalDefaults: {
      citations: [],
      links: [],
      relatedSkills: [],
      relatedMcp: [],
      featured: false
    },
    preferredOrder: [
      "title",
      "authors",
      "venue",
      "year",
      "status",
      "summary",
      "tags",
      "trail",
      "citations",
      "links",
      "relatedSkills",
      "relatedMcp",
      "featured"
    ]
  },
  skills: {
    statuses: ["Live", "Draft", "Research"],
    requiredArrays: ["focus", "tags"],
    requiredNumbers: [],
    requiredStrings: ["title", "status", "summary", "updated"],
    optionalDefaults: {
      relatedPapers: [],
      relatedArticles: [],
      relatedMcp: [],
      outputs: []
    },
    preferredOrder: [
      "title",
      "status",
      "summary",
      "focus",
      "updated",
      "tags",
      "relatedPapers",
      "relatedArticles",
      "relatedMcp",
      "outputs"
    ]
  },
  mcp: {
    statuses: ["Active", "Planned", "Research"],
    requiredArrays: ["useCases", "capabilities"],
    requiredNumbers: [],
    requiredStrings: ["title", "category", "status", "summary"],
    optionalDefaults: {
      relatedPapers: [],
      relatedArticles: [],
      relatedSkills: [],
      links: []
    },
    preferredOrder: [
      "title",
      "category",
      "status",
      "summary",
      "useCases",
      "capabilities",
      "relatedPapers",
      "relatedArticles",
      "relatedSkills",
      "invocation",
      "links"
    ]
  }
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isAdminCollection(value: unknown): value is AdminCollection {
  return typeof value === "string" && adminCollections.includes(value as AdminCollection);
}

export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "untitled-note";
}

export function createDefaultFrontmatter(collection: AdminCollection, date = isoDateOnly(new Date())): FrontmatterRecord {
  switch (collection) {
    case "articles":
      return {
        title: "Untitled Article",
        date,
        status: "Draft",
        summary: "Short summary for the public article index.",
        tags: ["draft"],
        trail: "Research Notes",
        relatedPapers: [],
        relatedSkills: [],
        relatedMcp: [],
        links: []
      };
    case "papers":
      return {
        title: "Untitled Paper Note",
        authors: ["Author Name"],
        venue: "Venue",
        year: Number(date.slice(0, 4)),
        status: "To Read",
        summary: "Short summary for the paper note index.",
        tags: ["paper"],
        trail: "Reading Trail",
        citations: [],
        links: [],
        relatedSkills: [],
        relatedMcp: [],
        featured: false
      };
    case "skills":
      return {
        title: "Untitled Skill",
        status: "Draft",
        summary: "Short summary for the skill index.",
        focus: ["Focus area"],
        updated: date,
        tags: ["skill"],
        relatedPapers: [],
        relatedArticles: [],
        relatedMcp: [],
        outputs: []
      };
    case "mcp":
      return {
        title: "Untitled MCP Interface",
        category: "Tooling",
        status: "Planned",
        summary: "Short summary for the MCP interface index.",
        useCases: ["Primary use case"],
        capabilities: ["Primary capability"],
        relatedPapers: [],
        relatedArticles: [],
        relatedSkills: [],
        links: []
      };
  }
}

export function contentPath(collection: AdminCollection, slug: string): string {
  return `src/content/${collection}/${slug}.md`;
}

export function normalizeContentInput(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }

  const candidate = input as ContentItemInput;
  if (!isAdminCollection(candidate.collection)) {
    errors.push("Collection must be one of articles, papers, skills, or mcp.");
  }

  const slug = typeof candidate.slug === "string" ? candidate.slug.trim() : "";
  if (!slugPattern.test(slug)) {
    errors.push("Slug must use lowercase letters, numbers, and single hyphens.");
  }

  if (!isRecord(candidate.frontmatter)) {
    errors.push("Frontmatter must be a JSON object.");
  }

  const body = typeof candidate.body === "string" ? stripFrontmatter(candidate.body).trim() : "";
  if (!body) {
    errors.push("Body markdown is required.");
  }

  if (!isAdminCollection(candidate.collection) || !isRecord(candidate.frontmatter)) {
    return { ok: false, errors };
  }

  const collection = candidate.collection;
  const definition = collectionDefinitions[collection];
  const frontmatter = {
    ...definition.optionalDefaults,
    ...candidate.frontmatter
  };

  validateRequiredFrontmatter(definition, frontmatter, errors);

  const title = typeof frontmatter.title === "string" ? frontmatter.title.trim() : "";
  const status = typeof frontmatter.status === "string" ? frontmatter.status.trim() : "";

  if (!definition.statuses.includes(status)) {
    errors.push(`Status for ${collection} must be one of ${definition.statuses.join(", ")}.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      collection,
      slug,
      title,
      status,
      frontmatter: orderFrontmatter(collection, {
        ...frontmatter,
        title,
        status
      }),
      body
    }
  };
}

export function serializeMarkdown(collection: AdminCollection, frontmatter: FrontmatterRecord, body: string): string {
  const orderedFrontmatter = orderFrontmatter(collection, frontmatter);
  return `---\n${toYaml(orderedFrontmatter)}---\n\n${stripFrontmatter(body).trim()}\n`;
}

export function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) return normalized;

  const closingMarker = normalized.indexOf("\n---", 3);
  if (closingMarker === -1) return normalized;

  return normalized.slice(closingMarker + 4).replace(/^\r?\n/, "");
}

export function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function validateRequiredFrontmatter(
  definition: CollectionDefinition,
  frontmatter: FrontmatterRecord,
  errors: string[]
) {
  for (const key of definition.requiredStrings) {
    if (typeof frontmatter[key] !== "string" || !frontmatter[key].trim()) {
      errors.push(`Frontmatter field "${key}" must be a non-empty string.`);
    }
  }

  for (const key of definition.requiredArrays) {
    if (!Array.isArray(frontmatter[key])) {
      errors.push(`Frontmatter field "${key}" must be an array.`);
    }
  }

  for (const key of definition.requiredNumbers) {
    if (typeof frontmatter[key] !== "number" || !Number.isFinite(frontmatter[key])) {
      errors.push(`Frontmatter field "${key}" must be a finite number.`);
    }
  }
}

function orderFrontmatter(collection: AdminCollection, frontmatter: FrontmatterRecord): FrontmatterRecord {
  const ordered: FrontmatterRecord = {};
  const used = new Set<string>();

  for (const key of collectionDefinitions[collection].preferredOrder) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      ordered[key] = frontmatter[key];
      used.add(key);
    }
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    if (!used.has(key)) ordered[key] = value;
  }

  return ordered;
}

function toYaml(record: FrontmatterRecord): string {
  return Object.entries(record)
    .flatMap(([key, value]) => yamlEntry(key, value, 0))
    .join("\n")
    .concat("\n");
}

function yamlEntry(key: string, value: unknown, indent: number): string[] {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`];
    return [`${pad}${key}:`, ...yamlArray(value, indent + 2)];
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${pad}${key}: {}`];
    return [`${pad}${key}:`, ...entries.flatMap(([nestedKey, nestedValue]) => yamlEntry(nestedKey, nestedValue, indent + 2))];
  }

  return [`${pad}${key}: ${yamlScalar(value)}`];
}

function yamlArray(values: unknown[], indent: number): string[] {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}- []`);
      } else {
        lines.push(`${pad}-`);
        lines.push(...yamlArray(value, indent + 2));
      }
      continue;
    }

    if (isRecord(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        lines.push(`${pad}- {}`);
        continue;
      }

      entries.forEach(([key, nestedValue], index) => {
        const entryLines = yamlEntry(key, nestedValue, indent + 2);
        if (index === 0) {
          const [firstLine, ...rest] = entryLines;
          lines.push(`${pad}- ${firstLine.trimStart()}`);
          lines.push(...rest);
        } else {
          lines.push(...entryLines);
        }
      });
      continue;
    }

    lines.push(`${pad}- ${yamlScalar(value)}`);
  }

  return lines;
}

function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is FrontmatterRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFrontmatterRecord(value: unknown): value is FrontmatterRecord {
  return isRecord(value);
}
