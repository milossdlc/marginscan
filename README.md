# MarginScan

GitHub is the source of truth. Imported verbatim from AppDeploy production snapshot `1789196326597` in commit `ca468a1c5e9f2adaec55a20223ced35cf7a0ad2c`.

React/Vite frontend + Cloudflare Worker API + D1 document storage. Existing scanner, 36 football competitions, H2H/totals and closing-price calculations are retained. All runtime AppDeploy SDK imports have been replaced.

## Development and verification

Node 22 or newer. Run `npm ci`, `npm run build`, `npm run check`, `npm test`.
Run `npx wrangler d1 migrations apply marginscan-db --local`, then `npx wrangler dev --test-scheduled`.
Set a local provider key only in ignored `.dev.vars`. Never place it in Vite variables, source, screenshots, logs or GitHub.

## Deployment

Cloudflare Workers Builds watches `main`. Build: `npm ci && npm run build && npm run check && npm test`. Deploy: `npm run deploy` (apply D1 migrations, then deploy Worker and static assets). Deployment uses `--keep-vars` to preserve dashboard settings. Cron runs every five minutes but collection is gated by `COLLECTOR_ENABLED` and a configured secret. No custom domain or DNS route is in the config.

See [MIGRATION.md](MIGRATION.md) for gates, data migration, identity mapping and domain cutover.
