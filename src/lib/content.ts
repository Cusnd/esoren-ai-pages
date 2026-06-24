import type { CollectionEntry } from "astro:content";

export type PaperEntry = CollectionEntry<"papers">;
export type ArticleEntry = CollectionEntry<"articles">;
export type SkillEntry = CollectionEntry<"skills">;
export type McpEntry = CollectionEntry<"mcp">;

export const collectionPaths = {
  papers: "/papers",
  articles: "/articles",
  skills: "/skills",
  mcp: "/mcp"
} as const;

export function byTitle<T extends { data: { title: string } }>(entries: T[]) {
  return [...entries].sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export function papersByYear(entries: PaperEntry[]) {
  return [...entries].sort((a, b) => b.data.year - a.data.year || a.data.title.localeCompare(b.data.title));
}

export function articlesByDate(entries: ArticleEntry[]) {
  return [...entries].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function skillsByUpdated(entries: SkillEntry[]) {
  return [...entries].sort((a, b) => b.data.updated.getTime() - a.data.updated.getTime());
}

export function makeTitleMap(entries: { id: string; data: { title: string } }[]) {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry.data.title]));
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

export function labelFor(labels: Record<string, string>, id: string) {
  return labels[id] ?? id.replaceAll("-", " ");
}
