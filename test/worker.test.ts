import { beforeEach, describe, expect, it, vi } from "vitest";
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
};

function request(path: string, method = "GET", body?: unknown) {
	return worker.fetch(
		new Request(`https://shortin.test${path}`, {
			method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
		env,
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

describe("Worker API contract", () => {
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
