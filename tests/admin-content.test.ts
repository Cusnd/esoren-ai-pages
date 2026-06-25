import assert from "node:assert/strict";
import test from "node:test";

import {
  adminCollections,
  contentPath,
  createDefaultFrontmatter,
  normalizeContentInput,
  serializeMarkdown,
  stripFrontmatter,
  type AdminCollection
} from "../src/lib/admin-content";

test("default frontmatter validates for every admin collection", () => {
  for (const collection of adminCollections) {
    const frontmatter = createDefaultFrontmatter(collection, "2026-06-25");
    const result = normalizeContentInput({
      collection,
      slug: `test-${collection}`,
      frontmatter,
      body: "Body markdown."
    });

    assert.equal(result.ok, true, `${collection} default frontmatter should validate`);
  }
});

test("serializer emits Astro-compatible Markdown frontmatter", () => {
  const frontmatter = {
    title: "Retrieval Notes",
    date: "2026-06-25",
    status: "Draft",
    summary: "A note about retrieval.",
    tags: ["RAG", "search"],
    trail: "RAG Foundations",
    relatedPapers: ["retrieval-augmented-generation"],
    relatedSkills: [],
    relatedMcp: ["arxiv-search"],
    links: [{ label: "Paper", url: "https://arxiv.org/abs/2005.11401" }]
  };

  const markdown = serializeMarkdown("articles", frontmatter, "## Body\n\nContent.");

  assert.match(markdown, /^---\n/);
  assert.match(markdown, /title: "Retrieval Notes"/);
  assert.match(markdown, /tags:\n  - "RAG"\n  - "search"/);
  assert.match(markdown, /links:\n  - label: "Paper"\n    url: "https:\/\/arxiv\.org\/abs\/2005\.11401"/);
  assert.match(markdown, /\n---\n\n## Body\n\nContent.\n$/);
});

test("serializer strips accidental pasted frontmatter from body", () => {
  const collection: AdminCollection = "skills";
  const frontmatter = createDefaultFrontmatter(collection, "2026-06-25");
  const markdown = serializeMarkdown(
    collection,
    frontmatter,
    "---\ntitle: Old\n---\n\nFresh body."
  );

  assert.doesNotMatch(markdown, /title: Old/);
  assert.match(markdown, /Fresh body\.\n$/);
});

test("content path matches current Astro collection layout", () => {
  assert.equal(contentPath("papers", "retrieval-augmented-generation"), "src/content/papers/retrieval-augmented-generation.md");
});

test("normalization rejects invalid slug and collection-specific status", () => {
  const result = normalizeContentInput({
    collection: "articles",
    slug: "Bad Slug",
    frontmatter: {
      ...createDefaultFrontmatter("articles", "2026-06-25"),
      status: "Live"
    },
    body: "Body markdown."
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("Slug")));
    assert.ok(result.errors.some((error) => error.includes("Status")));
  }
});

test("stripFrontmatter leaves plain markdown untouched", () => {
  assert.equal(stripFrontmatter("## Heading\n\nBody."), "## Heading\n\nBody.");
});
