# Soren AI Pages

A static Astro research archive for AI papers, articles, reusable skills, and MCP tool interface notes.

## Stack

- Astro static output for Cloudflare Pages.
- Astro content collections backed by Markdown files.
- Plain CSS with project-level design tokens for the archive/interface visual system.
- No SSR, Pages Functions, database, CMS, or Cloudflare adapter in v1.

## Content

Content lives under `src/content/`:

- `papers/`: paper notes, citations, related skills, and related MCP tools.
- `articles/`: implementation-facing essays and research notes.
- `skills/`: reusable capabilities connected to papers, articles, and tools.
- `mcp/`: public documentation of MCP tool interfaces, not live website tool calls.

Schemas are defined in `src/content.config.ts`.

## Local Development

```bash
npm install
npm run dev
```

If running from WSL and `npm` resolves to a Windows shim, put the Linux Node/npm bin first:

```bash
PATH=/home/soren/.nvm/versions/node/v24.15.0/bin:$PATH npm run build
```

## Cloudflare Pages

Use these Pages settings:

- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: Cloudflare Pages v3 default is Node 22; any supported newer version is fine for this static build.

The site is static, so it does not need a Cloudflare adapter unless you later add server-rendered routes, API routes, or Cloudflare bindings.
