import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker";
import { createSheetsFake } from "./fixtures/sheets";

const fixture = createSheetsFake();

vi.mock("googleapis", () => ({
	google: {
		auth: { GoogleAuth: vi.fn() },
		sheets: vi.fn(() => ({ spreadsheets: { values: fixture.values } })),
	},
}));

const env = {
	SPREADSHEET_ID: "test-sheet",
	GOOGLE_PROJECT_ID: "test-project",
	GOOGLE_PRIVATE_KEY_ID: "test-key-id",
	GOOGLE_PRIVATE_KEY: "test-key",
	GOOGLE_CLIENT_EMAIL: "service@example.test",
	GOOGLE_CLIENT_ID: "test-client-id",
	SHORTIN_ADMIN_TOKEN: "test-admin-token",
};

function request(
	path: string,
	method = "GET",
	body?: unknown,
	bindings: Parameters<typeof worker.fetch>[1] = env,
	authorization = `Bearer ${env.SHORTIN_ADMIN_TOKEN}`,
) {
	return worker.fetch(
		new Request(`https://shortin.test${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				...(authorization ? { authorization } : {}),
			},
			body: JSON.stringify(body),
		}),
		bindings,
	);
}

async function expectResponse(
	response: Response,
	status: number,
	body: object,
) {
	expect(response.status).toBe(status);
	expect(await response.json()).toEqual(body);
}

beforeEach(() => {
	fixture.rows.length = 0;
	vi.clearAllMocks();
});

afterEach(() => vi.useRealTimers());

describe("Worker API contract", () => {
	it.each([
		"PUT",
		"DELETE",
	])("rejects unauthorized %s before reading Sheets", async (method) => {
		for (const authorization of [
			"",
			"Bearer invalid",
			"Basic test-admin-token",
		]) {
			const response = await request(
				"/shorten/alias",
				method,
				{ url: "https://example.test/" },
				env,
				authorization,
			);
			await expectResponse(response, 401, { error: "Unauthorized" });
			expect(response.headers.get("www-authenticate")).toBe("Bearer");
		}
		const { SHORTIN_ADMIN_TOKEN: _token, ...unconfigured } = env;
		await expectResponse(
			await request("/shorten/alias", method, {}, unconfigured),
			401,
			{ error: "Unauthorized" },
		);
		for (const operation of Object.values(fixture.values)) {
			expect(operation).not.toHaveBeenCalled();
		}
	});

	it("creates, resolves, updates and deletes a link", async () => {
		const url = "https://example.test/original";
		const newUrl = "https://example.test/updated";
		const created = await request("/shorten", "POST", { url });
		expect(created.status).toBe(201);
		const record = (await created.json()) as { shortCode: string };
		expect(record).toEqual({
			id: expect.any(String),
			shortCode: expect.stringMatching(/^[a-zA-Z0-9]{6}$/),
			url,
			createdAt: expect.any(String),
			updatedAt: expect.any(String),
			count: 0,
		});

		const lookup = `/${record.shortCode}`;
		const mutation = `/shorten${lookup}`;
		await expectResponse(await request(lookup), 200, { url });
		await expectResponse(await request(`${mutation}/stats`), 200, { count: 1 });
		await expectResponse(await request(mutation, "PUT", { url: newUrl }), 200, {
			message: "Short code updated successfully",
		});
		await expectResponse(await request(lookup), 200, { url: newUrl });
		await expectResponse(await request(mutation, "DELETE"), 200, {
			message: "Short code deleted successfully",
		});
		await expectResponse(await request(lookup), 404, {
			error: "Short code not found",
		});
	});

	it("clears all six cells without changing neighboring row positions", async () => {
		const before = ["id1", "https://example.test/one", "one", "d1", "e1", 3];
		const after = ["id3", "https://example.test/three", "three", "d3", "e3", 7];
		fixture.rows.push(
			[...before],
			["id2", "https://example.test/two", "two", "d2", "e2", 5],
			[...after],
		);

		expect((await request("/shorten/two", "DELETE")).status).toBe(200);
		expect(fixture.values.clear).toHaveBeenCalledExactlyOnceWith({
			spreadsheetId: "test-sheet",
			range: "Sheet1!A2:F2",
		});
		expect(fixture.rows).toEqual([before, ["", "", "", "", "", ""], after]);
		await expectResponse(await request("/two"), 404, {
			error: "Short code not found",
		});
		await expectResponse(await request("/shorten/three/stats"), 200, {
			count: 7,
		});
	});

	it("rejects creation without a URL", async () => {
		await expectResponse(await request("/shorten", "POST", {}), 400, {
			error: "URL is required",
		});
		expect(fixture.values.append).not.toHaveBeenCalled();
	});

	it("rejects a duplicate custom alias", async () => {
		const body = { url: "https://example.test/", shortCodeInput: "alias" };
		const created = await request("/shorten", "POST", body);
		expect(created.status).toBe(201);
		expect(await created.json()).toMatchObject({ shortCode: "alias" });
		await expectResponse(await request("/shorten", "POST", body), 400, {
			error: "Short code already in use",
		});
		expect(fixture.values.append).toHaveBeenCalledTimes(1);
	});

	it("returns 404 for an unsupported route", async () => {
		await expectResponse(await request("/unknown/path", "POST"), 404, {
			error: "Not Found",
		});
	});

	it("returns a generic error when a Sheets lookup fails", async () => {
		fixture.values.get.mockRejectedValueOnce(new Error("get-failed"));
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expectResponse(await request("/abc"), 500, {
				error: "Failed to retrieve short URL",
			});
		} finally {
			log.mockRestore();
		}
	});

	it("does not expose upstream update error details in responses or logs", async () => {
		const marker = "dummy-sensitive-marker";
		fixture.rows.push(["id", "https://example.test/", "alias", "d", "e", 0]);
		fixture.values.update.mockRejectedValueOnce(new Error(marker));
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expectResponse(
				await request("/shorten/alias", "PUT", {
					url: "https://example.test/new",
				}),
				500,
				{ error: "Failed to update short URL" },
			);
			expect(log.mock.calls).toEqual([
				[{ event: "sheets_operation_failed", operation: "update" }],
			]);
		} finally {
			log.mockRestore();
		}
	});
});

describe("link lifecycle", () => {
	const rollout = "2026-01-01T00:00:00.000Z";
	const bindings = { ...env, LINK_LIFECYCLE_ROLLOUT_AT: rollout };
	const destination = "https://example.test/original";

	it.each([
		{
			created: "2025-01-01T00:00:00.000Z",
			expires: "2026-01-31T00:00:00.000Z",
		},
		{
			created: "2026-01-02T00:00:00.000Z",
			expires: "2026-02-01T00:00:00.000Z",
		},
	])("resolves and counts until $expires, then reserves the expired alias", async ({
		created,
		expires,
	}) => {
		fixture.rows.push([], ["id", destination, "alias", created, created, 4]);
		const expiry = Date.parse(expires);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(expiry - 1);
		await expectResponse(
			await request("/alias", "GET", undefined, bindings),
			200,
			{ url: destination },
		);
		expect(fixture.rows[1][5]).toBe(5);
		fixture.values.update.mockClear();
		vi.setSystemTime(expiry);
		await expectResponse(
			await request("/alias", "GET", undefined, bindings),
			404,
			{ error: "Short code not found" },
		);
		await expectResponse(
			await request(
				"/shorten/alias",
				"PUT",
				{ url: "https://example.test/new" },
				bindings,
			),
			404,
			{ error: "Short code not found" },
		);
		await expectResponse(
			await request(
				"/shorten",
				"POST",
				{ url: destination, shortCodeInput: "alias" },
				bindings,
			),
			400,
			{ error: "Short code already in use" },
		);
		expect(fixture.values.update).not.toHaveBeenCalled();
		expect(fixture.values.append).not.toHaveBeenCalled();
		expect(
			(await request("/shorten/alias", "DELETE", undefined, bindings)).status,
		).toBe(200);
	});

	it("does not restart the expiry clock on an active admin edit", async () => {
		const created = "2026-01-01T00:00:00.000Z";
		fixture.rows.push(["id", destination, "alias", created, created, 4]);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-30T00:00:00.000Z"));
		const url = "https://example.test/edited";
		expect(
			(await request("/shorten/alias", "PUT", { url }, bindings)).status,
		).toBe(200);
		expect(fixture.rows[0][3]).toBe(created);
		vi.setSystemTime(new Date("2026-01-31T00:00:00.000Z"));
		expect((await request("/alias", "GET", undefined, bindings)).status).toBe(
			404,
		);
	});

	it("leaves records with invalid creation dates readable for manual review", async () => {
		fixture.rows.push(["id", destination, "alias", "unknown", "", 4]);
		await expectResponse(
			await request("/alias", "GET", undefined, bindings),
			200,
			{ url: destination },
		);
	});

	it("keeps expiry disabled until the rollout binding is set", async () => {
		const created = "2025-01-01T00:00:00.000Z";
		fixture.rows.push(["id", destination, "alias", created, created, 4]);
		await expectResponse(await request("/alias"), 200, { url: destination });
	});

	it("rejects a malformed rollout binding instead of silently disabling expiry", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expectResponse(
				await request("/alias", "GET", undefined, {
					...env,
					LINK_LIFECYCLE_ROLLOUT_AT: "2026-01-01",
				}),
				500,
				{ error: "Server configuration error" },
			);
			expect(fixture.values.get).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});
});
