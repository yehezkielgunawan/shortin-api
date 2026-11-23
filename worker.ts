import { createHash, timingSafeEqual } from "node:crypto";
import { isExpired, parseUtcTimestamp } from "./helper/linkAge.mjs";

// Types for Cloudflare Workers
interface Env {
	GOOGLE_PROJECT_ID?: string;
	GOOGLE_PRIVATE_KEY_ID?: string;
	GOOGLE_PRIVATE_KEY?: string;
	GOOGLE_CLIENT_EMAIL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_AUTH_URI?: string;
	GOOGLE_TOKEN_URI?: string;
	GOOGLE_AUTH_PROVIDER_X509_CERT_URL?: string;
	GOOGLE_CLIENT_X509_CERT_URL?: string;
	GOOGLE_UNIVERSE_DOMAIN?: string;
	SPREADSHEET_ID?: string;
	SHORTIN_ADMIN_TOKEN?: string;
	LINK_LIFECYCLE_ROLLOUT_AT?: string;
}

function isAdmin(request: Request, token: string | undefined): boolean {
	const supplied = /^Bearer ([^\s,]+)$/i.exec(
		request.headers.get("authorization") ?? "",
	)?.[1];
	if (!token || !supplied) return false;
	const digest = (value: string) => createHash("sha256").update(value).digest();
	return timingSafeEqual(digest(supplied), digest(token));
}

// Worker entry point
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);
			const method = request.method.toLowerCase();
			const { SHORTIN_ADMIN_TOKEN, LINK_LIFECYCLE_ROLLOUT_AT, ...sheetsEnv } =
				env;
			if (
				url.pathname.startsWith("/shorten/") &&
				(method === "put" || method === "delete") &&
				!isAdmin(request, SHORTIN_ADMIN_TOKEN)
			) {
				return Response.json(
					{ error: "Unauthorized" },
					{ status: 401, headers: { "www-authenticate": "Bearer" } },
				);
			}
			const rolloutAt = parseUtcTimestamp(LINK_LIFECYCLE_ROLLOUT_AT);
			if (LINK_LIFECYCLE_ROLLOUT_AT && rolloutAt === null) {
				console.error({ event: "invalid_link_lifecycle_rollout" });
				return Response.json(
					{ error: "Server configuration error" },
					{ status: 500 },
				);
			}
			// Validate required environment variables
			const requiredEnvVars = [
				"GOOGLE_PROJECT_ID",
				"GOOGLE_PRIVATE_KEY_ID",
				"GOOGLE_PRIVATE_KEY",
				"GOOGLE_CLIENT_EMAIL",
				"GOOGLE_CLIENT_ID",
				"SPREADSHEET_ID",
			];

			const missingVars = requiredEnvVars.filter(
				(key) => !env[key as keyof Env],
			);
			if (missingVars.length > 0) {
				console.error("Missing required environment variables:", missingVars);
				return new Response(
					JSON.stringify({
						error:
							"Server configuration error: Missing required environment variables",
					}),
					{ status: 500, headers: { "content-type": "application/json" } },
				);
			}

			// Set environment variables from Cloudflare Workers env
			Object.entries(sheetsEnv).forEach(([key, value]) => {
				if (value) process.env[key] = value;
			});

			// Get request body for POST/PUT/PATCH requests
			let body = null;
			if (["post", "put", "patch"].includes(method)) {
				const text = await request.text();
				if (text) {
					try {
						body = JSON.parse(text);
					} catch {
						body = text;
					}
				}
			}

			// Normalize the request for the route handlers.
			const mockReq = {
				method: method.toUpperCase(),
				url: url.pathname + url.search,
				path: url.pathname,
				query: Object.fromEntries(url.searchParams.entries()),
				params: {},
				body,
				headers: (() => {
					const headerObj: Record<string, string> = {};
					request.headers.forEach((value, key) => {
						headerObj[key] = value;
					});
					return headerObj;
				})(),
				get: function (name: string) {
					return this.headers[name.toLowerCase()];
				},
			};

			// Resolve when the route handler finishes writing the response.
			return new Promise<Response>((resolve) => {
				let statusCode = 200;
				const responseHeaders: Record<string, string> = {};
				let responseBody = "";

				// Create a simple mock response object
				const mockRes = {
					statusCode: 200,
					headersSent: false,

					status(code: number) {
						statusCode = code;
						return this;
					},

					setHeader(name: string, value: string) {
						responseHeaders[name] = value;
					},

					getHeader(name: string) {
						return responseHeaders[name];
					},

					json(data: any) {
						responseHeaders["content-type"] = "application/json";
						responseBody = JSON.stringify(data);
						this.end();
						return this;
					},

					send(data: any) {
						if (typeof data === "object") {
							this.json(data);
						} else {
							responseHeaders["content-type"] = "text/plain";
							responseBody = String(data);
							this.end();
						}
						return this;
					},

					end(data?: string) {
						if (data) responseBody = data;

						resolve(
							new Response(responseBody, {
								status: statusCode,
								headers: responseHeaders,
							}),
						);
					},
				};

				// Handle routing manually for main endpoints
				try {
					if (mockReq.path === "/" && mockReq.method === "GET") {
						mockRes.send("Welcome to the URL Shortener API!");
					} else if (mockReq.path === "/shorten" && mockReq.method === "POST") {
						// Import and call the shorten logic directly
						handleShortenPost(mockReq, mockRes);
					} else if (
						mockReq.path.startsWith("/shorten/") &&
						mockReq.method === "DELETE"
					) {
						const shortCode = mockReq.path.split("/")[2];
						mockReq.params = { shortCodeInput: shortCode };
						handleShortenDelete(mockReq, mockRes);
					} else if (
						mockReq.path.startsWith("/shorten/") &&
						mockReq.method === "PUT"
					) {
						const shortCode = mockReq.path.split("/")[2];
						mockReq.params = { shortCodeInput: shortCode };
						handleShortenPut(mockReq, mockRes, rolloutAt);
					} else if (
						mockReq.path.endsWith("/stats") &&
						mockReq.method === "GET"
					) {
						const pathParts = mockReq.path.split("/");
						const shortCode = pathParts[pathParts.length - 2];
						mockReq.params = { shortCodeInput: shortCode };
						handleShortenStats(mockReq, mockRes);
					} else if (mockReq.path !== "/" && mockReq.method === "GET") {
						const shortCode = mockReq.path.substring(1); // Remove leading slash
						mockReq.params = { shortCodeInput: shortCode };
						handleShortCodeGet(mockReq, mockRes, rolloutAt);
					} else {
						mockRes.status(404).json({ error: "Not Found" });
					}
				} catch {
					console.error({ event: "worker_request_failed", operation: "route" });
					mockRes.status(500).json({ error: "Internal Server Error" });
				}
			});
		} catch {
			console.error({ event: "worker_request_failed", operation: "fetch" });
			return new Response("Internal Server Error", { status: 500 });
		}
	},
};

// Route handlers
async function handleShortenPost(req: any, res: any) {
	const { url, shortCodeInput } = req.body || {};

	if (!url) {
		return res.status(400).json({ error: "URL is required" });
	}

	try {
		const { google } = await import("googleapis");
		const { generateShortCode } = await import("./helper/generateShortCode");

		// Build credentials object with only defined values
		const credentials: any = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
		};

		// Only add optional fields if they are defined
		if (process.env.GOOGLE_AUTH_URI) {
			credentials.auth_uri = process.env.GOOGLE_AUTH_URI;
		}
		if (process.env.GOOGLE_TOKEN_URI) {
			credentials.token_uri = process.env.GOOGLE_TOKEN_URI;
		}
		if (process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL) {
			credentials.auth_provider_x509_cert_url =
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL;
		}
		if (process.env.GOOGLE_CLIENT_X509_CERT_URL) {
			credentials.client_x509_cert_url =
				process.env.GOOGLE_CLIENT_X509_CERT_URL;
		}
		if (process.env.GOOGLE_UNIVERSE_DOMAIN) {
			credentials.universe_domain = process.env.GOOGLE_UNIVERSE_DOMAIN;
		}

		const GAuth = new google.auth.GoogleAuth({
			credentials: credentials,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"],
		});

		const sheet = google.sheets({ auth: GAuth, version: "v4" });

		// Check if shortCodeInput exists and is already in use
		if (shortCodeInput) {
			const spreadsheetId = process.env.SPREADSHEET_ID || "";
			const range = "Sheet1!C:C";

			const response = await sheet.spreadsheets.values.get({
				spreadsheetId,
				range,
			});

			const existingShortCodes = response.data.values?.flat() || [];

			if (existingShortCodes.includes(shortCodeInput)) {
				return res.status(400).json({ error: "Short code already in use" });
			}
		}

		const id = `id_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
		const shortCode = shortCodeInput || generateShortCode();
		const timestamp = new Date().toISOString();

		const record = {
			id,
			url,
			shortCode,
			createdAt: timestamp,
			updatedAt: timestamp,
			count: 0,
		};

		await sheet.spreadsheets.values.append({
			spreadsheetId: process.env.SPREADSHEET_ID || "",
			range: "Sheet1!A:F",
			valueInputOption: "RAW",
			requestBody: {
				values: [
					[
						record.id,
						record.url,
						record.shortCode,
						record.createdAt,
						record.updatedAt,
						record.count,
					],
				],
			},
		});

		res.status(201).json(record);
	} catch {
		console.error({ event: "sheets_operation_failed", operation: "create" });
		res.status(500).json({ error: "Failed to create short URL" });
	}
}

async function handleShortenDelete(req: any, res: any) {
	const { shortCodeInput } = req.params;

	if (!shortCodeInput) {
		return res.status(400).json({ error: "Short code is required" });
	}

	try {
		const { google } = await import("googleapis");

		// Build credentials object with only defined values
		const credentials: any = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
		};

		// Only add optional fields if they are defined
		if (process.env.GOOGLE_AUTH_URI) {
			credentials.auth_uri = process.env.GOOGLE_AUTH_URI;
		}
		if (process.env.GOOGLE_TOKEN_URI) {
			credentials.token_uri = process.env.GOOGLE_TOKEN_URI;
		}
		if (process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL) {
			credentials.auth_provider_x509_cert_url =
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL;
		}
		if (process.env.GOOGLE_CLIENT_X509_CERT_URL) {
			credentials.client_x509_cert_url =
				process.env.GOOGLE_CLIENT_X509_CERT_URL;
		}
		if (process.env.GOOGLE_UNIVERSE_DOMAIN) {
			credentials.universe_domain = process.env.GOOGLE_UNIVERSE_DOMAIN;
		}

		const GAuth = new google.auth.GoogleAuth({
			credentials: credentials,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"],
		});

		const sheet = google.sheets({ auth: GAuth, version: "v4" });
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const range = "Sheet1!C:C";

		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range,
		});

		const existingShortCodes = response.data.values?.flat() || [];

		if (!existingShortCodes.includes(shortCodeInput)) {
			return res.status(404).json({ error: "Short code not found" });
		}

		const rowIndex = existingShortCodes.indexOf(shortCodeInput) + 1;
		const deleteRange = `Sheet1!A${rowIndex}:F${rowIndex}`;

		await sheet.spreadsheets.values.clear({
			spreadsheetId,
			range: deleteRange,
		});

		res.status(200).json({ message: "Short code deleted successfully" });
	} catch {
		console.error({ event: "sheets_operation_failed", operation: "delete" });
		res.status(500).json({ error: "Failed to delete short URL" });
	}
}

async function handleShortenPut(req: any, res: any, rolloutAt: number | null) {
	const { shortCodeInput } = req.params;
	const { url } = req.body || {};

	if (!shortCodeInput || !url) {
		return res.status(400).json({ error: "Short code and URL are required" });
	}

	try {
		const { google } = await import("googleapis");

		// Build credentials object with only defined values
		const credentials: any = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
		};

		// Only add optional fields if they are defined
		if (process.env.GOOGLE_AUTH_URI) {
			credentials.auth_uri = process.env.GOOGLE_AUTH_URI;
		}
		if (process.env.GOOGLE_TOKEN_URI) {
			credentials.token_uri = process.env.GOOGLE_TOKEN_URI;
		}
		if (process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL) {
			credentials.auth_provider_x509_cert_url =
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL;
		}
		if (process.env.GOOGLE_CLIENT_X509_CERT_URL) {
			credentials.client_x509_cert_url =
				process.env.GOOGLE_CLIENT_X509_CERT_URL;
		}
		if (process.env.GOOGLE_UNIVERSE_DOMAIN) {
			credentials.universe_domain = process.env.GOOGLE_UNIVERSE_DOMAIN;
		}

		const GAuth = new google.auth.GoogleAuth({
			credentials: credentials,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"],
		});

		const sheet = google.sheets({ auth: GAuth, version: "v4" });
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: "Sheet1!C:D",
		});
		const rows = response.data.values ?? [];
		const index = rows.findIndex((row) => row[0] === shortCodeInput);
		if (index < 0 || isExpired(rows[index][1], rolloutAt, Date.now())) {
			return res.status(404).json({ error: "Short code not found" });
		}

		const rowIndex = index + 1;
		const updateRange = `Sheet1!B${rowIndex}`;

		await sheet.spreadsheets.values.update({
			spreadsheetId,
			range: updateRange,
			valueInputOption: "RAW",
			requestBody: {
				values: [[url]],
			},
		});

		res.status(200).json({ message: "Short code updated successfully" });
	} catch {
		console.error({ event: "sheets_operation_failed", operation: "update" });
		res.status(500).json({ error: "Failed to update short URL" });
	}
}

async function handleShortCodeGet(
	req: any,
	res: any,
	rolloutAt: number | null,
) {
	const { shortCodeInput } = req.params;

	if (!shortCodeInput) {
		return res.status(400).json({ error: "Short code is required" });
	}

	try {
		const { google } = await import("googleapis");

		// Build credentials object with only defined values
		const credentials: any = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
		};

		// Only add optional fields if they are defined
		if (process.env.GOOGLE_AUTH_URI) {
			credentials.auth_uri = process.env.GOOGLE_AUTH_URI;
		}
		if (process.env.GOOGLE_TOKEN_URI) {
			credentials.token_uri = process.env.GOOGLE_TOKEN_URI;
		}
		if (process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL) {
			credentials.auth_provider_x509_cert_url =
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL;
		}
		if (process.env.GOOGLE_CLIENT_X509_CERT_URL) {
			credentials.client_x509_cert_url =
				process.env.GOOGLE_CLIENT_X509_CERT_URL;
		}
		if (process.env.GOOGLE_UNIVERSE_DOMAIN) {
			credentials.universe_domain = process.env.GOOGLE_UNIVERSE_DOMAIN;
		}

		const GAuth = new google.auth.GoogleAuth({
			credentials: credentials,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"],
		});

		const sheet = google.sheets({ auth: GAuth, version: "v4" });
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: "Sheet1!C:D",
		});
		const rows = response.data.values ?? [];
		const index = rows.findIndex((row) => row[0] === shortCodeInput);
		if (index < 0 || isExpired(rows[index][1], rolloutAt, Date.now())) {
			return res.status(404).json({ error: "Short code not found" });
		}

		const rowIndex = index + 1;
		const urlRange = `Sheet1!B${rowIndex}`;
		const countRange = `Sheet1!F${rowIndex}`;

		const urlResponse = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: urlRange,
		});

		const url = urlResponse.data.values?.[0]?.[0];

		const countResponse = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: countRange,
		});

		// Update the count
		await sheet.spreadsheets.values.update({
			spreadsheetId,
			range: countRange,
			valueInputOption: "RAW",
			requestBody: {
				values: [[Number(countResponse.data.values?.[0]?.[0] || 0) + 1]],
			},
		});

		res.status(200).json({ url });
	} catch {
		console.error({ event: "sheets_operation_failed", operation: "lookup" });
		res.status(500).json({ error: "Failed to retrieve short URL" });
	}
}

async function handleShortenStats(req: any, res: any) {
	const { shortCodeInput } = req.params;

	if (!shortCodeInput) {
		return res.status(400).json({ error: "Short code is required" });
	}

	try {
		const { google } = await import("googleapis");

		// Build credentials object with only defined values
		const credentials: any = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
		};

		// Only add optional fields if they are defined
		if (process.env.GOOGLE_AUTH_URI) {
			credentials.auth_uri = process.env.GOOGLE_AUTH_URI;
		}
		if (process.env.GOOGLE_TOKEN_URI) {
			credentials.token_uri = process.env.GOOGLE_TOKEN_URI;
		}
		if (process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL) {
			credentials.auth_provider_x509_cert_url =
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL;
		}
		if (process.env.GOOGLE_CLIENT_X509_CERT_URL) {
			credentials.client_x509_cert_url =
				process.env.GOOGLE_CLIENT_X509_CERT_URL;
		}
		if (process.env.GOOGLE_UNIVERSE_DOMAIN) {
			credentials.universe_domain = process.env.GOOGLE_UNIVERSE_DOMAIN;
		}

		const GAuth = new google.auth.GoogleAuth({
			credentials: credentials,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"],
		});

		const sheet = google.sheets({ auth: GAuth, version: "v4" });
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const range = "Sheet1!C:C";

		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range,
		});

		const existingShortCodes = response.data.values?.flat() || [];

		if (!existingShortCodes.includes(shortCodeInput)) {
			return res.status(404).json({ error: "Short code not found" });
		}

		const rowIndex = existingShortCodes.indexOf(shortCodeInput) + 1;
		const countRange = `Sheet1!F${rowIndex}`;

		const countResponse = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: countRange,
		});

		const count = countResponse.data.values?.[0]?.[0];

		res.status(200).json({ count });
	} catch {
		console.error({ event: "sheets_operation_failed", operation: "stats" });
		res.status(500).json({ error: "Failed to retrieve short URL stats" });
	}
}
