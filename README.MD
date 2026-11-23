# Shortin

Shortin is a URL-shortening API running on Cloudflare Workers, with Google Sheets for link storage and visit counts. The production API is at <https://shortin-api.yehezgun.com>.

## Local development

1. Use Node.js 22 or newer and the pnpm version pinned in `package.json`.
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the required bindings. **Use a separate development spreadsheet and a service account that only has access to that sheet.** Wrangler runs locally, but Sheets requests still write to the real spreadsheet identified by `SPREADSHEET_ID`. Never copy production credentials into `.dev.vars`.
4. Enable the Google Sheets API in the development project and give the service account editor access to the development sheet. Name the tab `Sheet1` and use columns `A:F` for ID, URL, short code, created timestamp, updated timestamp, and visit count, respectively.
5. Put the PEM value in a quoted `GOOGLE_PRIVATE_KEY` entry, with newlines written as `\n`.
6. Run `pnpm dev` to start the local Worker at `http://127.0.0.1:8787`. This uses the checked-in Wrangler configuration and watches `worker.ts`.

Run `pnpm check` for TypeScript, Biome, tests, and a Wrangler deploy dry run. The tests do not need Google credentials. With the local Worker running against the development spreadsheet, set a development-only `SHORTIN_ADMIN_TOKEN` in `.dev.vars` and run `pnpm smoke:local` for a create → lookup → stats → update → delete check. It deletes its test link and exits nonzero on failure.

## API

| Method and path | Result |
| --- | --- |
| `GET /` | `200`, plain-text welcome message |
| `POST /shorten` | `201` with `{ id, url, shortCode, createdAt, updatedAt, count }`; accepts `{ "url": "https://example.com", "shortCodeInput": "optional-alias" }` |
| `GET /:shortCodeInput` | `200 { url }` and increments the visit count. This endpoint returns JSON; it does not redirect. |
| `GET /shorten/:shortCodeInput/stats` | `200 { count }` |
| `PUT /shorten/:shortCodeInput` | Admin only. `200 { "message": "Short code updated successfully" }`; accepts `{ "url": "https://example.com/new" }` and does not renew an active link. |
| `DELETE /shorten/:shortCodeInput` | Admin only. `200 { "message": "Short code deleted successfully" }`; can delete active or expired links. |

Requests for an unknown short code return `404 { "error": "Short code not found" }`. Missing required inputs and duplicate custom aliases return `400`.

For admin operations, send `Authorization: Bearer <SHORTIN_ADMIN_TOKEN>` from the CLI. Invalid or missing credentials return `401`. Never put this token in public client code or URLs. This is a single admin role, not per-link ownership. The Worker does not implement application-level rate limiting.

## Link expiry and cleanup preview

- Expiry is off until `LINK_LIFECYCLE_ROLLOUT_AT` is configured. Choose a fixed UTC timestamp such as `2026-06-01T12:00:00.000Z` and set it as a Worker secret. Use a separate timestamp in development. A redeploy must not change the production timestamp.
- A link stops resolving after 30 days, measured from the later of its creation and rollout. Requests at or after that boundary get `404` and do not increment visits. The stats endpoint still reports prior counts until deletion. Unparseable or future creation timestamps are excluded from age-based actions and should be reviewed.
- Expired aliases remain reserved while their rows exist. Public reclaim and bulk deletion are not enabled in this phase.
- For the manual **Preview expired link cleanup** workflow, configure the GitHub `link-cleanup-preview` environment for `main`. Set its `LINK_LIFECYCLE_ROLLOUT_AT` variable to the **same** timestamp as the Worker. Add `SHORTIN_PREVIEW_SPREADSHEET_ID`, `SHORTIN_PREVIEW_GOOGLE_CLIENT_EMAIL`, and `SHORTIN_PREVIEW_GOOGLE_PRIVATE_KEY` as environment secrets. Use a separate Google service account with **Viewer** access to the target sheet.
- Preview reports only counts in Actions logs. Claims are eligible **strictly after 40 days** on the same clock. A trusted operator can set the same preview variables locally and run `pnpm cleanup:preview --include-aliases`. Neither mode writes to the sheet or prints destination URLs.

## Deployment

The **Deploy to Cloudflare Workers** GitHub Actions workflow is manual. It runs the same checks as PR CI, verifies the required secret names on the existing `shortin-api` Worker, then deploys. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.

Configure the required Google credentials, spreadsheet ID, and a separate high-entropy `SHORTIN_ADMIN_TOKEN` as **Worker secrets** in Cloudflare before deploying. Update the admin CLI to send that token. Optional overrides are not required for deployment. Keep the Worker's write credentials out of GitHub Actions, and never commit local credentials.

Licensed under the [MIT License](LICENSE).
