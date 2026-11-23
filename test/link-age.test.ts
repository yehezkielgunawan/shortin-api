import { describe, expect, it } from "vitest";
import { parseUtcTimestamp, previewCleanup } from "../helper/linkAge.mjs";

describe("cleanup preview", () => {
	it("uses the grace period and reports only claims strictly older than 40 days", () => {
		const rollout = Date.parse("2026-01-01T00:00:00.000Z");
		const rows = [
			["legacy", "2025-12-01T00:00:00.000Z"],
			["newer", "2026-01-02T00:00:00.000Z"],
			["invalid", "2026-02-30T00:00:00.000Z"],
			["future", "2026-03-01T00:00:00.000Z"],
			[],
		];
		const boundary = Date.parse("2026-02-10T00:00:00.000Z");
		expect(previewCleanup(rows, rollout, boundary)).toEqual({
			eligibleAliases: [],
			invalidTimestampCount: 2,
		});
		expect(previewCleanup(rows, rollout, boundary + 1)).toEqual({
			eligibleAliases: ["legacy"],
			invalidTimestampCount: 2,
		});
	});

	it("requires a valid UTC timestamp with an explicit Z", () => {
		expect(parseUtcTimestamp("2026-01-01T00:00:00Z")).toBe(
			Date.parse("2026-01-01T00:00:00.000Z"),
		);
		expect(parseUtcTimestamp("2026-01-01T00:00:00")).toBeNull();
		expect(parseUtcTimestamp("2026-02-30T00:00:00.000Z")).toBeNull();
	});
});
