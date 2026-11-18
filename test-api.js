const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const baseUrl = "http://127.0.0.1:8787";
const original = "https://example.test/smoke/original";
const updated = "https://example.test/smoke/updated";

async function request(path, status, method = "GET", body) {
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: body ? { "content-type": "application/json" } : undefined,
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15_000),
		redirect: "error",
	});
	assert.equal(response.status, status, `${method} ${path}`);
	return response;
}

async function smoke() {
	const welcome = await request("/", 200);
	assert.equal(await welcome.text(), "Welcome to the URL Shortener API!");

	const alias = `smoke-${randomUUID()}`;
	const lookup = `/${alias}`;
	const mutation = `/shorten${lookup}`;
	const created = await request("/shorten", 201, "POST", {
		url: original,
		shortCodeInput: alias,
	});
	try {
		assert.equal((await created.json()).shortCode, alias);
		assert.deepEqual(await (await request(lookup, 200)).json(), {
			url: original,
		});
		assert.deepEqual(await (await request(`${mutation}/stats`, 200)).json(), {
			count: 1,
		});
		await request(mutation, 200, "PUT", { url: updated });
		assert.deepEqual(await (await request(lookup, 200)).json(), {
			url: updated,
		});
	} finally {
		await request(mutation, 200, "DELETE");
	}
	await request(lookup, 404);
	console.log("Worker smoke test passed.");
}

smoke().catch((error) => {
	console.error("Worker smoke test failed:", error.message);
	process.exitCode = 1;
});
