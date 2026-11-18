# Shortin

Shortin is a URL-shortening API running on Cloudflare Workers, with Google Sheets for link storage and visit counts. The production API is at <https://shortin-api.yehezgun.com>.

## Local development

1. Use Node.js 22 or newer and the pnpm version pinned in `package.json`.
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the required bindings. **Use a separate development spreadsheet and a service account that only has access to that sheet.** Wrangler runs locally, but Sheets requests still write to the real spreadsheet identified by `SPREADSHEET_ID`. Never copy production credentials into `.dev.vars`.
4. Enable the Google Sheets API in the development project and give the service account editor access to the development sheet. Name the tab `Sheet1` and use columns `A:F` for ID, URL, short code, created timestamp, updated timestamp, and visit count, respectively.
5. Put the PEM value in a quoted `GOOGLE_PRIVATE_KEY` entry, with newlines written as `\n`.
6. Run `pnpm dev` to start the local Worker at `http://127.0.0.1:8787`. This uses the checked-in Wrangler configuration and watches `worker.ts`.

Run `pnpm check` for TypeScript, Biome, tests, and a Wrangler deploy dry run. The tests do not need Google credentials. With the local Worker running against the development spreadsheet, run `pnpm smoke:local` for a create → lookup → stats → update → delete check. It deletes its test link and exits nonzero on failure.

## API

| Method and path | Result |
| --- | --- |
| `GET /` | `200`, plain-text welcome message |
| `POST /shorten` | `201` with `{ id, url, shortCode, createdAt, updatedAt, count }`; accepts `{ "url": "https://example.com", "shortCodeInput": "optional-alias" }` |
| `GET /:shortCodeInput` | `200 { url }` and increments the visit count. This endpoint returns JSON; it does not redirect. |
| `GET /shorten/:shortCodeInput/stats` | `200 { count }` |
| `PUT /shorten/:shortCodeInput` | `200 { "message": "Short code updated successfully" }`; accepts `{ "url": "https://example.com/new" }` |
| `DELETE /shorten/:shortCodeInput` | `200 { "message": "Short code deleted successfully" }` |

Requests for an unknown short code return `404 { "error": "Short code not found" }`. Missing required inputs and duplicate custom aliases return `400`.

The Worker does not implement application-level rate limiting or link ownership checks. Verify any upstream rate-limit and mutation-access policies in the Cloudflare dashboard before relying on them.

## Deployment

The **Deploy to Cloudflare Workers** GitHub Actions workflow is manual. It runs the same checks as PR CI, verifies the required secret names on the existing `shortin-api` Worker, then deploys. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.

Configure the required Google credentials and spreadsheet ID listed in `.dev.vars.example` as **Worker secrets** in Cloudflare, using production values. Optional overrides are not required for deployment. Do not add Google credentials to GitHub Actions or commit local credentials.

Licensed under the [MIT License](LICENSE).
