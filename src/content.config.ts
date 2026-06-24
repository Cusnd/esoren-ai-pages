import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const linkSchema = z.object({
  label: z.string(),
  url: z.string().url()
});

const paperSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  venue: z.string(),
  year: z.number(),
  status: z.enum(["To Read", "Reading", "Notes", "Implemented", "Archived"]),
  summary: z.string(),
  tags: z.array(z.string()),
  trail: z.string(),
  citations: z.array(linkSchema).default([]),
  links: z.array(linkSchema).default([]),
  relatedSkills: z.array(z.string()).default([]),
  relatedMcp: z.array(z.string()).default([]),
  featured: z.boolean().default(false)
});

const articleSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  status: z.enum(["Draft", "Published", "Updated"]),
  summary: z.string(),
  tags: z.array(z.string()),
  trail: z.string(),
  relatedPapers: z.array(z.string()).default([]),
  relatedSkills: z.array(z.string()).default([]),
  relatedMcp: z.array(z.string()).default([]),
  links: z.array(linkSchema).default([])
});

const skillSchema = z.object({
  title: z.string(),
  status: z.enum(["Live", "Draft", "Research"]),
  summary: z.string(),
  focus: z.array(z.string()),
  updated: z.coerce.date(),
  tags: z.array(z.string()),
  relatedPapers: z.array(z.string()).default([]),
  relatedArticles: z.array(z.string()).default([]),
  relatedMcp: z.array(z.string()).default([]),
  outputs: z.array(linkSchema.extend({ kind: z.string() })).default([])
});

const mcpSchema = z.object({
  title: z.string(),
  category: z.string(),
  status: z.enum(["Active", "Planned", "Research"]),
  summary: z.string(),
  useCases: z.array(z.string()),
  capabilities: z.array(z.string()),
  relatedPapers: z.array(z.string()).default([]),
  relatedArticles: z.array(z.string()).default([]),
  relatedSkills: z.array(z.string()).default([]),
  invocation: z.string().optional(),
  links: z.array(linkSchema).default([])
});

export const collections = {
  papers: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/papers" }),
    schema: paperSchema
  }),
  articles: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
    schema: articleSchema
  }),
  skills: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/skills" }),
    schema: skillSchema
  }),
  mcp: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/mcp" }),
    schema: mcpSchema
  })
};
