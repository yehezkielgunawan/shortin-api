import { describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";

const dummyBindings = {
	SPREADSHEET_ID: "test-sheet",
	GOOGLE_PROJECT_ID: "test-project",
	GOOGLE_PRIVATE_KEY_ID: "test-key-id",
	GOOGLE_PRIVATE_KEY: "test-key",
	GOOGLE_CLIENT_EMAIL: "service@example.test",
	GOOGLE_CLIENT_ID: "test-client-id",
	SHORTIN_ADMIN_TOKEN: "runtime-test-token",
} satisfies Record<string, string>;

describe("Worker runtime", () => {
	it.each([
		{ name: "welcome", vars: dummyBindings, status: 200 },
		{ name: "missing bindings", vars: {}, status: 500 },
	])("serves the $name response in workerd", async ({ vars, status }) => {
		const worker = await unstable_dev("worker.ts", {
			config: "wrangler.jsonc",
			// A nonempty list prevents Wrangler from loading a developer's .dev.vars.
			envFiles: [".dev.vars.example"],
			vars,
			local: true,
			port: 0,
			logLevel: "none",
			experimental: {
				disableDevRegistry: true,
				disableExperimentalWarning: true,
			},
		});
		try {
			const response = await worker.fetch("/");
			expect(response.status).toBe(status);
			if (status === 200) {
				expect(await response.text()).toBe("Welcome to the URL Shortener API!");
				const denied = await worker.fetch("/shorten/example", {
					method: "DELETE",
					headers: { authorization: "Bearer wrong-token" },
				});
				expect(denied.status).toBe(401);
				const authorized = await worker.fetch("/shorten/example", {
					method: "PUT",
					headers: { authorization: "Bearer runtime-test-token" },
				});
				expect(authorized.status).toBe(400);
			} else {
				expect(await response.json()).toEqual({
					error:
						"Server configuration error: Missing required environment variables",
				});
			}
		} finally {
			await worker.stop();
		}
	}, 45_000);
});
