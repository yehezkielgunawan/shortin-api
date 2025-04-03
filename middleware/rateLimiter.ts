// custom rate limiter without express-rate-limit
// Simple in-memory rate limiter
import type { Request, Response, NextFunction } from "express";
interface RateLimiterEntry {
	count: number;
	lastReset: number;
}

// Store IP addresses and their request counts
const rateLimitStore = new Map<string, RateLimiterEntry>();

// Rate limiter middleware
export const rateLimiter = (
	requestsPerMinute = 30, // Default: 30 requests per minute
	windowMs: number = 60 * 1000, // Default: 1 minute window
) => {
	return (req: Request, res: Response, next: NextFunction) => {
		// Get client IP
		const ip = req.ip || req.socket.remoteAddress || "unknown";
		const now = Date.now();

		// Get or create entry for this IP
		if (!rateLimitStore.has(ip)) {
			rateLimitStore.set(ip, {
				count: 0,
				lastReset: now,
			});
		}

		const entry = rateLimitStore.get(ip) as RateLimiterEntry;

		// Reset counter if the time window has passed
		if (now - entry.lastReset > windowMs) {
			entry.count = 0;
			entry.lastReset = now;
		}

		// Increment request count
		entry.count++;

		// Check if over limit
		if (entry.count > requestsPerMinute) {
			// Too many requests
			res.status(429).json({
				error: "Too many requests",
				message: "Please try again later",
				retryAfter: Math.ceil((entry.lastReset + windowMs - now) / 1000),
			});
		}

		// Update the store
		rateLimitStore.set(ip, entry);

		// Add rate limit headers
		res.setHeader("X-RateLimit-Limit", requestsPerMinute.toString());
		res.setHeader(
			"X-RateLimit-Remaining",
			(requestsPerMinute - entry.count).toString(),
		);
		res.setHeader(
			"X-RateLimit-Reset",
			Math.ceil((entry.lastReset + windowMs) / 1000).toString(),
		);

		// Continue to the next middleware
		return next();
	};
};
