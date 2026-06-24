type FilterState = Record<string, string>;

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const queryParams = ["q", "type", "status", "selected"];

function updateUrl(state: FilterState, includeSelected = false) {
  const url = new URL(window.location.href);

  queryParams.forEach((key) => {
    if (key === "selected" && !includeSelected) {
      url.searchParams.delete(key);
      return;
    }
    const value = state[key];
    if (!value || value === "all") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function initWorkbench(root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>("[data-item-id]"));
  const filters = Array.from(root.querySelectorAll<HTMLElement>("[data-filter]"));
  const search = root.querySelector<HTMLInputElement>("input[data-search]");
  const detailPanel = root.querySelector<HTMLElement>("[data-detail-panel]");
  const previewMode = root.dataset.workbenchMode === "preview" && Boolean(detailPanel);
  const countNode = root.querySelector<HTMLElement>("[data-result-count]");
  const emptyState = root.querySelector<HTMLElement>("[data-empty-state]");
  const sectionRows = Array.from(root.querySelectorAll<HTMLElement>("[data-section-for]"));
  const templates = new Map(
    Array.from(root.querySelectorAll<HTMLElement>("[data-detail-template]")).map((template) => [
      template.dataset.detailTemplate ?? "",
      template
    ])
  );
  const params = new URLSearchParams(window.location.search);
  const state: FilterState = {
    q: params.get("q") ?? "",
    type: params.get("type") ?? "all",
    status: params.get("status") ?? "all",
    selected: previewMode
      ? params.get("selected") ??
        items.find((item) => item.classList.contains("selected"))?.dataset.itemId ??
        items[0]?.dataset.itemId ??
        ""
      : ""
  };

  if (search) {
    search.value = state.q;
  }

  const rowMatches = (item: HTMLElement) => {
    const searchable = normalize(item.dataset.searchText);
    const matchesQuery = !state.q || searchable.includes(normalize(state.q));
    const matchesType = state.type === "all" || item.dataset.type === state.type;
    const matchesStatus = state.status === "all" || item.dataset.status === state.status;
    return matchesQuery && matchesType && matchesStatus;
  };

  const visibleItems = () => items.filter((item) => !item.hidden);

  const renderDetail = (id: string) => {
    if (!detailPanel || !previewMode) return;
    const template = templates.get(id);
    if (!template) return;

    detailPanel.classList.add("is-updating");
    detailPanel.innerHTML = template.innerHTML;
    detailPanel.dataset.selected = id;
    window.setTimeout(() => detailPanel.classList.remove("is-updating"), 260);
  };

  const selectItem = (id: string, shouldFocus = false) => {
    if (!previewMode) return;
    const target = items.find((item) => item.dataset.itemId === id && !item.hidden) ?? visibleItems()[0];
    if (!target) {
      state.selected = "";
      items.forEach((item) => {
        item.classList.remove("selected");
        item.setAttribute("aria-selected", "false");
        item.tabIndex = -1;
      });
      if (detailPanel) {
        detailPanel.innerHTML = '<div class="empty-detail"><h2>No matching item</h2><p>Adjust the search or filters to bring public notes back into view.</p></div>';
        detailPanel.dataset.selected = "";
      }
      updateUrl(state, previewMode);
      return;
    }

    state.selected = target.dataset.itemId ?? "";
    items.forEach((item) => {
      const selected = item === target;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      const caret = item.querySelector<HTMLElement>(".row-caret");
      caret?.classList.toggle("visible", selected);
    });
    renderDetail(state.selected);
    if (shouldFocus) target.focus({ preventScroll: true });
    updateUrl(state, previewMode);
  };

  const applyFilters = () => {
    let visibleCount = 0;
    const visibleTypes = new Set<string>();

    filters.forEach((filter) => {
      const key = filter.dataset.filter ?? "";
      const value = filter.dataset.filterValue ?? "all";
      const active = (state[key] ?? "all") === value;
      filter.classList.toggle("active", active);
      filter.setAttribute("aria-pressed", String(active));
    });

    items.forEach((item, index) => {
      const visible = rowMatches(item);
      item.hidden = !visible;
      item.style.setProperty("--row-delay", `${Math.min(index, 8) * 18}ms`);
      if (visible) {
        visibleCount += 1;
        if (item.dataset.type) visibleTypes.add(item.dataset.type);
      }
    });

    sectionRows.forEach((section) => {
      const type = section.dataset.sectionFor ?? "";
      section.hidden = !visibleTypes.has(type);
    });

    if (countNode) countNode.textContent = String(visibleCount);
    if (emptyState) emptyState.hidden = visibleCount > 0;
    if (previewMode && (!state.selected || items.find((item) => item.dataset.itemId === state.selected)?.hidden)) {
      state.selected = visibleItems()[0]?.dataset.itemId ?? "";
    }
    if (previewMode) {
      selectItem(state.selected);
    } else {
      updateUrl(state);
    }
  };

  search?.addEventListener("input", () => {
    state.q = search.value;
    applyFilters();
  });

  filters.forEach((filter) => {
    filter.addEventListener("click", (event) => {
      event.preventDefault();
      const key = filter.dataset.filter ?? "";
      const value = filter.dataset.filterValue ?? "all";
      state[key] = value;
      applyFilters();
    });
  });

  items.forEach((item) => {
    item.tabIndex = previewMode && item.classList.contains("selected") ? 0 : 0;
    item.setAttribute("aria-selected", String(item.classList.contains("selected")));
    item.addEventListener("click", (event) => {
      if (!previewMode) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      selectItem(item.dataset.itemId ?? "");
    });
    item.addEventListener("keydown", (event) => {
      if (!previewMode) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const rows = visibleItems();
      const currentIndex = rows.indexOf(item);
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const next = rows[(currentIndex + offset + rows.length) % rows.length];
      if (next) selectItem(next.dataset.itemId ?? "", true);
    });
  });

  applyFilters();
}

function initHomeMotion(root: HTMLElement) {
  const trailLinks = Array.from(root.querySelectorAll<HTMLElement>("[data-home-link]"));
  const relatedItems = Array.from(root.querySelectorAll<HTMLElement>("[data-home-related]"));
  const setActive = (key: string) => {
    relatedItems.forEach((item) => item.classList.toggle("is-linked-active", item.dataset.homeRelated === key));
  };

  trailLinks.forEach((link) => {
    const key = link.dataset.homeLink ?? "";
    link.addEventListener("pointerenter", () => setActive(key));
    link.addEventListener("focus", () => setActive(key));
    link.addEventListener("pointerleave", () => setActive(""));
    link.addEventListener("blur", () => setActive(""));
  });
}

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    const search = document.querySelector<HTMLInputElement>("input[data-search]");
    if (search) {
      event.preventDefault();
      search.focus();
      search.select();
    }
  }
});

document.querySelectorAll<HTMLElement>("[data-workbench]").forEach(initWorkbench);
document.querySelectorAll<HTMLElement>("[data-home-system]").forEach(initHomeMotion);
