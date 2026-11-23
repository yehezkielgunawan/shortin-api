const DAY_MS = 86_400_000;

export function parseUtcTimestamp(value: unknown): number | null {
	if (
		typeof value !== "string" ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
	) {
		return null;
	}
	const time = Date.parse(value);
	const canonical = value.length === 20 ? value.replace("Z", ".000Z") : value;
	return Number.isFinite(time) && new Date(time).toISOString() === canonical
		? time
		: null;
}

export function claimAgeMs(
	createdAt: unknown,
	rolloutAt: number,
	now: number,
): number | null {
	const created = parseUtcTimestamp(createdAt);
	return created === null || created > now
		? null
		: now - Math.max(created, rolloutAt);
}

export function isExpired(
	createdAt: unknown,
	rolloutAt: number | null,
	now: number,
): boolean {
	const age = rolloutAt === null ? null : claimAgeMs(createdAt, rolloutAt, now);
	return age !== null && age >= 30 * DAY_MS;
}

export function previewCleanup(
	rows: readonly (readonly unknown[])[],
	rolloutAt: number,
	now: number,
) {
	const eligibleAliases: string[] = [];
	let invalidTimestampCount = 0;
	for (const [alias, createdAt] of rows) {
		if (typeof alias !== "string" || !alias.trim()) continue;
		const age = claimAgeMs(createdAt, rolloutAt, now);
		if (age === null) invalidTimestampCount++;
		else if (age > 40 * DAY_MS) eligibleAliases.push(alias);
	}
	return { eligibleAliases, invalidTimestampCount };
}
