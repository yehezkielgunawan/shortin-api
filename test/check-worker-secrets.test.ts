import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const names = [
	"GOOGLE_PROJECT_ID",
	"GOOGLE_PRIVATE_KEY_ID",
	"GOOGLE_PRIVATE_KEY",
	"GOOGLE_CLIENT_EMAIL",
	"GOOGLE_CLIENT_ID",
	"SPREADSHEET_ID",
];

function check(input: string) {
	return spawnSync(process.execPath, ["scripts/check-worker-secrets.mjs"], {
		input,
		encoding: "utf8",
	});
}

describe("Worker deployment secret check", () => {
	it("accepts a complete list without printing it", () => {
		const result = check(JSON.stringify(names.map((name) => ({ name }))));
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("");
	});

	it("reports the missing name without printing other fields", () => {
		const result = check(
			JSON.stringify(
				names.slice(1).map((name) => ({ name, text: "dummy-marker" })),
			),
		);
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe(
			"Missing required Worker secrets: GOOGLE_PROJECT_ID\n",
		);
	});

	it("fails closed on invalid input without echoing it", () => {
		const result = check("dummy-marker");
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Could not read Worker's secret list.\n");
	});
});
