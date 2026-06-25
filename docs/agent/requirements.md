# Requirements

- Build a demo website for showcasing Skills, MCP integrations, and academic articles.
- Choose a Cloudflare Pages-friendly technology stack.
- Keep the implementation static and easy to extend.
- Implement v1 as an English-first research notes library with list and detail pages.
- Use Markdown-backed Astro content collections for Papers, Articles, Skills, and MCP interfaces.
- Preserve static Cloudflare Pages deployment with `npm run build` and `dist`.
- Keep MCP entries as public documentation of tool interfaces, not live website tool calls.
- Add a private, single-user admin surface for drafting and publishing content without converting the public site to SSR.
- Use Cloudflare Pages Functions and D1 only for admin CRUD, revision history, and GitHub-backed publishing.
- Keep public content published as Markdown under `src/content/` so Cloudflare Pages can continue static builds.

## Todo

- [ ] Add a comprehensive animation system.
