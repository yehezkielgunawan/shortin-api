import { vi } from "vitest";

type Cell = string | number;

export function createSheetsFake() {
	const rows: Cell[][] = [];
	const get = vi.fn(async ({ range }: { range: string }) => {
		if (range === "Sheet1!C:C") {
			return { data: { values: rows.map((row) => [row[2] ?? ""]) } };
		}
		if (range === "Sheet1!C:D") {
			return {
				data: { values: rows.map((row) => [row[2] ?? "", row[3] ?? ""]) },
			};
		}
		const match = /^Sheet1!([BF])(\d+)$/.exec(range);
		if (!match) throw new Error(`Unexpected read range: ${range}`);
		const cell = rows[Number(match[2]) - 1]?.[match[1] === "B" ? 1 : 5];
		return { data: { values: cell === undefined ? [] : [[cell]] } };
	});
	const append = vi.fn(async ({ requestBody }: ValuesInput) => {
		rows.push([...requestBody.values[0]]);
	});
	const update = vi.fn(async ({ range, requestBody }: ValuesInput) => {
		const match = /^Sheet1!([BF])(\d+)$/.exec(range);
		if (!match) throw new Error(`Unexpected update range: ${range}`);
		rows[Number(match[2]) - 1][match[1] === "B" ? 1 : 5] =
			requestBody.values[0][0];
	});
	const clear = vi.fn(async ({ range }: { range: string }) => {
		const match = /^Sheet1!A(\d+):([EF])\1$/.exec(range);
		if (!match) throw new Error(`Unexpected clear range: ${range}`);
		rows[Number(match[1]) - 1].fill("", 0, match[2] === "E" ? 5 : 6);
	});
	return { rows, values: { get, append, update, clear } };
}

type ValuesInput = { range: string; requestBody: { values: Cell[][] } };
