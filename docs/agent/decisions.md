# Decisions

## Astro Static Site

Use Astro with static output for the first version because the site is content-heavy, deploys cleanly to Cloudflare Pages, and can later grow into Markdown/MDX content collections without adding runtime server complexity.

## Markdown Content Collections

Use Astro content collections backed by Markdown files for Papers, Articles, Skills, and MCP interfaces. This keeps the site static while making long-form notes easier to maintain than TypeScript seed data.

## Static Cloudflare Pages Deployment

Keep `astro.config.mjs` on static output and deploy to Cloudflare Pages with build command `npm run build` and output directory `dist`. Do not add the Cloudflare adapter until the site needs server-rendered routes, API routes, or bindings.
