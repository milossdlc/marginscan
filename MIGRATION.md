# Migration runbook

## Verified resources

- GitHub: milossdlc/marginscan (public), main.
- Source baseline: AppDeploy marginscan-drkm5o, snapshot 1789196326597, all 25 files.
- Worker: marginscan, account cd4ad3f52bd1cc7238757ed7ab309b50.
- D1: marginscan-db, 5b52c427-1d9f-48d1-9b3f-6ce02e28df7f, WEUR.
- Build trigger: 0d074e31-66db-46b8-8a5e-95b6e06f7b8e, watches main.
- AppDeploy production/DNS have not been changed.

## Required before live cutover

1. THE_ODDS_API_KEY is present as an encrypted Worker secret (verified September 23, 2026; value not read). Leave COLLECTOR_ENABLED=false until the historical import is verified. Do not send secret values in chat.
2. Obtain a complete owner export of the AppDeploy database including collection names, record IDs and records. The available AppDeploy connector has source-reading tools but no database export. Public scanner endpoints are bounded views and are not a complete backup. Current source has no runtime object-storage operations; no R2 bucket is needed for this version. Static frontend assets use Workers Assets. If an export contains external uploaded objects, preserve and inventory them before choosing R2 bindings.
3. Normalize the export to NDJSON {collection,id,record}, store it under ignored migration-data/, then run `python3 scripts/prepare-import.py migration-data/export.ndjson migration-data/import.sql`. Inspect the manifest, back up D1, import using `npx wrangler d1 execute marginscan-db --remote --file migration-data/import.sql`, and compare per-collection counts and IDs. Import is idempotent; it replaces matching IDs and never erases unseen destination records. The destination collector must remain disabled. Cursor tokens for closing progress must be reset because AppDeploy tokens are incompatible with D1.
4. Configure Cloudflare Access sign-in for /api/auth/login on the destination host, allowing the intended beta users (not only the owner). Set ACCESS_TEAM_DOMAIN and ACCESS_AUD in the Worker. Login should set CF_Authorization for the destination host; other scanner paths remain public. JWT signature, issuer and audience are verified server-side; email headers alone are never trusted. Verify sign-in/logout and owner/non-owner tests before cutover. Access identities must be explicitly mapped to original AppDeploy user IDs in identity_map using a verified owner export; never map identities based on unverified email input. Existing user records remain inaccessible to a different identity until mapped.
5. Enable COLLECTOR_ENABLED=true and observe at least two successful five-minute collections, real Pinnacle timestamps, history continuity and closing finalization. Check provider quota impact while the original collector still operates. Disable the original collector only as part of an agreed cutover; this migration has not changed it.
6. Verify desktop/mobile scanner filters, archive dates, details, watchlist, historical CLV, signed-in profile/questionnaire/tracker and owner access with migrated data. Empty-data smoke tests alone are not full production QA.

## Domain plan — getmarginscan.com

The domain is not present in the connected Cloudflare account (verified September 13, 2026). Do not change current records or nameservers before build, data and auth QA pass.

After readiness: inventory current authoritative DNS including mail/TXT/CAA and DNSSEC; add the zone to Cloudflare and copy all records preserving the current AppDeploy origin; review DNSSEC and registrar delegation before changing nameservers. Use only the nameservers assigned to the new zone. Once the zone is active and existing services still work, attach getmarginscan.com as a Worker Custom Domain, wait for TLS and test HTTPS/API/session behavior. Decide www redirect explicitly and preserve mail records. Save the old AppDeploy DNS targets for rollback. Keep AppDeploy intact through the observation window. Roll back domain routing and collection ownership together if data continuity or authentication fails.

References: https://developers.cloudflare.com/workers/configuration/secrets/ ; https://developers.cloudflare.com/workers/configuration/cron-triggers/ ; https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ ; https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## September 23 scanner build

GitHub main remains the source of truth. The existing Workers Builds trigger watches main and runs build, type checks and tests before deployment. The destination is https://marginscan.milos-sdlc.workers.dev. Collector remains paused and Access configuration remains empty until historical migration and account mapping are complete. Stable AppDeploy production and DNS were not changed.

The public OddsMath interface was reviewed only for workflow patterns: compact filters, date navigation, kickoff windows, country/league grouping and dense tabular comparison. No external source code, branding or visual assets were copied.

Scanner additions: Today/Tomorrow/explicit local date, country/region filter, grouping, team/competition search, kickoff window, implied probability delta, lifecycle state, and explicit partial-data notices. Watchlist includes upcoming and started-today pre-match movers, ranked by captured opening-to-signal movement. Archive dates remain UTC signal dates, explicitly labelled. League analytics count one latest signal per exact market/selection/line, exclude missing closes from follow-through denominators and show sample sizes.

Only existing supported full-time 1X2 and paired exact-line totals are exposed. Closing validation is shared by details and tables and rejects stale, wrong-line, post-kickoff, and pre-signal observations.
