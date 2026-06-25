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

type DetailCache = {
  item: ContentItem;
  revisions: RevisionItem[];
};

type ContentListResponse = {
  items: ContentListItem[];
  selected?: DetailCache;
};

type EditorSnapshot = {
  collection: AdminCollection;
  currentItem: ContentItem | null;
  revisions: RevisionItem[];
  title: string;
  slug: string;
  status: string;
  frontmatterText: string;
  body: string;
};

type AdminState = {
  collection: AdminCollection;
  currentItem: ContentItem | null;
  itemsByCollection: Record<AdminCollection, ContentListItem[]>;
  editorSnapshotsByCollection: Partial<Record<AdminCollection, EditorSnapshot>>;
  detailsById: Map<string, DetailCache>;
  revisions: RevisionItem[];
  activeRequestId: number;
};

const app = document.querySelector<HTMLElement>("[data-admin-app]");

if (app) {
  initAdmin(app);
}

function emptyItemsByCollection(): Record<AdminCollection, ContentListItem[]> {
  return {
    articles: [],
    papers: [],
    skills: [],
    mcp: []
  };
}

function initAdmin(root: HTMLElement) {
  const state: AdminState = {
    collection: "articles",
    currentItem: null,
    itemsByCollection: emptyItemsByCollection(),
    editorSnapshotsByCollection: {},
    detailsById: new Map(),
    revisions: [],
    activeRequestId: 0
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

  const nextRequestId = () => {
    state.activeRequestId += 1;
    return state.activeRequestId;
  };

  const itemsFor = (collection = state.collection) => state.itemsByCollection[collection];

  const switchCollection = (collection: AdminCollection, persistBefore = true) => {
    if (persistBefore) persistCurrentEditorSnapshot();
    state.collection = collection;
    collectionField.value = collection;
    syncCollectionButtons(collectionButtons, collection);
    syncStatusOptions(statusField, collection);
    renderList();

    const snapshot = state.editorSnapshotsByCollection[collection];
    if (snapshot) {
      restoreEditorSnapshot(snapshot);
    } else {
      startNewDraft(collection, "Refreshing");
    }

    void refreshCollection(collection);
  };

  const refreshCollection = async (collection = state.collection) => {
    const requestId = nextRequestId();
    if (state.collection === collection) apiState.textContent = "Refreshing";
    try {
      const data = await requestJson<ContentListResponse>(
        `/api/admin/content?collection=${collection}&includeFirst=1`
      );
      state.itemsByCollection[collection] = data.items;
      updateCounts(countNodes, collection, data.items.length);
      if (data.selected) {
        state.detailsById.set(data.selected.item.id, data.selected);
      }

      if (state.activeRequestId !== requestId || state.collection !== collection) return;

      renderList();
      if (!state.editorSnapshotsByCollection[collection] && data.selected) {
        applyDetail(data.selected);
        persistCurrentEditorSnapshot();
      } else if (!state.editorSnapshotsByCollection[collection] && data.items.length === 0) {
        startNewDraft(collection, "Ready");
      }
      apiState.textContent = "Ready";
    } catch (error) {
      if (state.activeRequestId !== requestId || state.collection !== collection) return;
      const message = messageFrom(error);
      if (!state.editorSnapshotsByCollection[collection]) startNewDraft(collection, message);
      if (itemsFor(collection).length === 0) {
        list.replaceChildren(emptyState("No saved content.", "Saved drafts appear here."));
      } else {
        renderList();
      }
      apiState.textContent = message;
    } finally {
      publishButton.disabled = !state.currentItem;
    }
  };

  const renderList = () => {
    const query = search.value.trim().toLowerCase();
    const items = itemsFor();
    const visible = items.filter((item) =>
      `${item.title} ${item.slug} ${item.status}`.toLowerCase().includes(query)
    );

    resultCount.textContent = `${visible.length} ${visible.length === 1 ? "item" : "items"}`;

    if (items.length === 0) {
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
    delete state.editorSnapshotsByCollection[state.collection];
    const cached = state.detailsById.get(id);
    if (cached) {
      applyDetail(cached);
      persistCurrentEditorSnapshot();
      apiState.textContent = "Ready";
      return;
    }

    const requestId = nextRequestId();
    setBusy(true, "Loading item");
    try {
      const data = await requestJson<DetailCache>(`/api/admin/content/${id}`);
      if (state.activeRequestId !== requestId) return;
      state.detailsById.set(data.item.id, data);
      applyDetail(data);
      persistCurrentEditorSnapshot();
      apiState.textContent = "Ready";
    } catch (error) {
      if (state.activeRequestId !== requestId) return;
      apiState.textContent = messageFrom(error);
    } finally {
      setBusy(false, apiState.textContent || "Ready");
    }
  };

  const startNewDraft = (collection = state.collection, label = "Drafting") => {
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
    apiState.textContent = label;
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
      delete state.editorSnapshotsByCollection[data.item.collection];
      state.detailsById.delete(data.item.id);
      syncCollectionButtons(collectionButtons, data.item.collection);
      fillForm(data.item);
      renderPreview();
      renderRevisions();
      renderPublishState(null);
      await refreshCollection(data.item.collection);
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
      state.detailsById.delete(state.currentItem.id);
      delete state.editorSnapshotsByCollection[state.currentItem.collection];
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

  const captureEditorSnapshot = (): EditorSnapshot | null => {
    if (!isAdminCollection(collectionField.value)) return null;
    return {
      collection: collectionField.value,
      currentItem: state.currentItem,
      revisions: [...state.revisions],
      title: titleField.value,
      slug: slugField.value,
      status: statusField.value,
      frontmatterText: frontmatterField.value,
      body: bodyField.value
    };
  };

  const persistCurrentEditorSnapshot = () => {
    const snapshot = captureEditorSnapshot();
    if (snapshot) state.editorSnapshotsByCollection[snapshot.collection] = snapshot;
  };

  const restoreEditorSnapshot = (snapshot: EditorSnapshot) => {
    state.collection = snapshot.collection;
    state.currentItem = snapshot.currentItem;
    state.revisions = [...snapshot.revisions];
    collectionField.value = snapshot.collection;
    syncCollectionButtons(collectionButtons, snapshot.collection);
    syncStatusOptions(statusField, snapshot.collection);
    titleField.value = snapshot.title;
    slugField.value = snapshot.slug;
    statusField.value = snapshot.status;
    frontmatterField.value = snapshot.frontmatterText;
    bodyField.value = snapshot.body;
    versionNode.textContent = snapshot.currentItem ? `v${snapshot.currentItem.version}` : "v0";
    publishedNode.textContent = snapshot.currentItem?.published_at
      ? formatDateTime(snapshot.currentItem.published_at)
      : "Not published";
    publishButton.disabled = !snapshot.currentItem;
    renderList();
    renderPreview();
    renderRevisions();
    renderPublishState(null);
  };

  const applyDetail = ({ item, revisions }: DetailCache) => {
    state.currentItem = item;
    state.revisions = revisions;
    state.collection = item.collection;
    collectionField.value = item.collection;
    syncCollectionButtons(collectionButtons, item.collection);
    syncStatusOptions(statusField, item.collection);
    fillForm(item);
    renderList();
    renderPreview();
    renderRevisions();
    renderPublishState(null);
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
        switchCollection(collection);
      }
    });
  });

  collectionField.addEventListener("change", () => {
    if (isAdminCollection(collectionField.value)) {
      startNewDraft(collectionField.value);
      persistCurrentEditorSnapshot();
    }
  });

  titleField.addEventListener("input", () => {
    if (!state.currentItem) slugField.value = slugifyTitle(titleField.value);
    renderPreview();
    persistCurrentEditorSnapshot();
  });
  slugField.addEventListener("input", () => {
    renderPreview();
    persistCurrentEditorSnapshot();
  });
  statusField.addEventListener("change", () => {
    renderPreview();
    persistCurrentEditorSnapshot();
  });
  frontmatterField.addEventListener("input", () => {
    renderPreview();
    persistCurrentEditorSnapshot();
  });
  bodyField.addEventListener("input", () => {
    renderPreview();
    persistCurrentEditorSnapshot();
  });
  search.addEventListener("input", renderList);
  newButton.addEventListener("click", () => {
    startNewDraft(state.collection);
    persistCurrentEditorSnapshot();
  });
  saveButton.addEventListener("click", () => {
    void saveCurrent();
  });
  publishButton.addEventListener("click", () => {
    void publishCurrent();
  });

  void loadIdentity();
  switchCollection("articles", false);
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
