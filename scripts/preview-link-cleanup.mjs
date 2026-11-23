import { google } from "googleapis";
import { parseUtcTimestamp, previewCleanup } from "../helper/linkAge.mts";

const rolloutAt = parseUtcTimestamp(process.env.LINK_LIFECYCLE_ROLLOUT_AT);
const spreadsheetId = process.env.SHORTIN_PREVIEW_SPREADSHEET_ID;
const clientEmail = process.env.SHORTIN_PREVIEW_GOOGLE_CLIENT_EMAIL;
const privateKey = process.env.SHORTIN_PREVIEW_GOOGLE_PRIVATE_KEY;

if (rolloutAt === null || !spreadsheetId || !clientEmail || !privateKey) {
	console.error("Missing or invalid cleanup preview configuration.");
	process.exitCode = 1;
} else {
	try {
		const auth = new google.auth.GoogleAuth({
			credentials: {
				client_email: clientEmail,
				private_key: privateKey.replace(/\\n/g, "\n"),
			},
			scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
		});
		const sheet = google.sheets({ auth, version: "v4" });
		const result = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: "Sheet1!C:D",
		});
		const now = Date.now();
		const { eligibleAliases, invalidTimestampCount } = previewCleanup(
			result.data.values ?? [],
			rolloutAt,
			now,
		);
		console.log(
			JSON.stringify({
				mode: "preview",
				asOf: new Date(now).toISOString(),
				eligibleCount: eligibleAliases.length,
				...(process.argv.includes("--include-aliases") && { eligibleAliases }),
				invalidTimestampCount,
			}),
		);
	} catch {
		console.error("Could not read the spreadsheet for cleanup preview.");
		process.exitCode = 1;
	}
}
