# Admin Setup

The public site remains a static Astro build. The admin surface uses Cloudflare Pages Functions only under `/api/admin/*`, with D1 as the draft/revision store and GitHub Markdown files as the public publishing source.

## Cloudflare

1. Create a D1 database, for example `esoren-ai-pages-admin`.
2. Apply `migrations/0001_admin_content.sql` to that database.
3. In the Cloudflare Pages project, add a D1 binding named `ADMIN_DB`.
4. Protect `/admin/*` and `/api/admin/*` with Cloudflare Access, limited to your email.
5. Add environment variables/secrets:
   - `GITHUB_TOKEN`: GitHub token with Contents write permission for `Cusnd/esoren-ai-pages`.
   - `CF_ACCESS_TEAM_DOMAIN`: your Access team domain, for example `https://team.cloudflareaccess.com`.
   - `CF_ACCESS_AUD`: the Access application audience tag.
   - `ADMIN_EMAIL`: the single email allowed to use the admin API.
   - `GITHUB_REPO`: defaults to `Cusnd/esoren-ai-pages` from `wrangler.jsonc`.
   - `GITHUB_BRANCH`: defaults to `main` from `wrangler.jsonc`.
   - `DEPLOY_HOOK_URL`: optional fallback if GitHub commits do not trigger Pages builds.

## Local Notes

Use `npm run build` for the existing static site verification. To run Pages Functions locally with D1, create the real D1 database first, then add the D1 binding in Cloudflare or extend `wrangler.jsonc` with the database id.

The committed `_routes.json` limits Functions invocation to `/api/admin` so public static pages stay on the free static asset path.
