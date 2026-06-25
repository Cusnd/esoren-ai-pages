# Decisions

## Astro Static Site

Use Astro with static output for the first version because the site is content-heavy, deploys cleanly to Cloudflare Pages, and can later grow into Markdown/MDX content collections without adding runtime server complexity.

## Markdown Content Collections

Use Astro content collections backed by Markdown files for Papers, Articles, Skills, and MCP interfaces. This keeps the site static while making long-form notes easier to maintain than TypeScript seed data.

## Static Cloudflare Pages Deployment

Keep `astro.config.mjs` on static output and deploy to Cloudflare Pages with build command `npm run build` and output directory `dist`. Do not add the Cloudflare adapter until the site needs server-rendered routes, API routes, or bindings.

## Admin Runtime Boundary

Add the management backend as Cloudflare Pages Functions under `/api/admin/*` while keeping the reader-facing site static. Limit Functions invocation with `_routes.json` so public static pages do not invoke dynamic code.

## D1 Drafts, GitHub Publishing

Use D1 as the private draft, revision, and publish-job store. Treat GitHub Markdown files in `src/content/` as the source for public builds; publishing from the admin API serializes frontmatter/body to Markdown and writes through the GitHub contents API.

## Single-User Cloudflare Access Admin

Protect `/admin/*` and `/api/admin/*` with Cloudflare Access, and verify the Access JWT server-side against the configured audience and team domain. Restrict admin API access to the configured `ADMIN_EMAIL`.
