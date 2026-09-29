# Deploy rules (read before changing anything)

- **Production:** Cloudflare Worker `marginscan`
- **Deploy = `git push` to `main`.** Cloudflare builds and deploys automatically (Git integration).
- **Never** run `wrangler deploy`, drag-and-drop uploads, or deploy from a copy in Downloads/zip files. A manual deploy from a stale copy rolled TippMatch back 17 days on 2026-09-29.
- Always `git pull` before editing. This GitHub repo is the only source of truth.
- Secrets live in Cloudflare (Worker settings → Variables and Secrets), never in this repo or in `wrangler.jsonc`.
- Project registry for all of Milos' projects: Google Drive → "Chat GPT projekti" → `36_Registar_projekata_i_deploy_plan_*.md`.
