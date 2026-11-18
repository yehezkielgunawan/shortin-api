import { readFileSync } from "node:fs";

// Keep this list in sync with the Worker entry point's required bindings.
const required = [
	"GOOGLE_PROJECT_ID",
	"GOOGLE_PRIVATE_KEY_ID",
	"GOOGLE_PRIVATE_KEY",
	"GOOGLE_CLIENT_EMAIL",
	"GOOGLE_CLIENT_ID",
	"SPREADSHEET_ID",
];

try {
	const secrets = JSON.parse(readFileSync(0, "utf8"));
	if (!Array.isArray(secrets)) throw new Error("Expected a JSON array");
	const names = new Set(secrets.map((secret) => secret.name));
	const missing = required.filter((name) => !names.has(name));
	if (missing.length > 0) {
		console.error(`Missing required Worker secrets: ${missing.join(", ")}`);
		process.exitCode = 1;
	}
} catch {
	console.error("Could not read Worker's secret list.");
	process.exitCode = 1;
}
