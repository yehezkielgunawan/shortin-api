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
}

// Simple Express to Workers adapter
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			// Set environment variables from Cloudflare Workers env
			Object.entries(env).forEach(([key, value]) => {
				if (value) process.env[key] = value;
			});

			const url = new URL(request.url);
			const method = request.method.toLowerCase();

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

			// Create a simple mock request object with essential Express properties
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

			// Promise to capture the Express response
			return new Promise<Response>((resolve, reject) => {
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
						handleShortenPut(mockReq, mockRes);
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
						handleShortCodeGet(mockReq, mockRes);
					} else {
						mockRes.status(404).json({ error: "Not Found" });
					}
				} catch (error) {
					console.error("Handler error:", error);
					mockRes.status(500).json({ error: "Internal Server Error" });
				}
			});
		} catch (error) {
			console.error("Worker error:", error);
			return new Response("Internal Server Error", { status: 500 });
		}
	},
};

// Handler functions (simplified versions of the Express route handlers)
async function handleShortenPost(req: any, res: any) {
	const { url, shortCodeInput } = req.body || {};

	if (!url) {
		return res.status(400).json({ error: "URL is required" });
	}

	try {
		const { google } = await import("googleapis");
		const { generateShortCode } = await import("./helper/generateShortCode");

		const credentials = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
			auth_uri: process.env.GOOGLE_AUTH_URI,
			token_uri: process.env.GOOGLE_TOKEN_URI,
			auth_provider_x509_cert_url:
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
			client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
			universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
		};

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
	} catch (error) {
		console.error("Error details:", error);
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

		const credentials = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
			auth_uri: process.env.GOOGLE_AUTH_URI,
			token_uri: process.env.GOOGLE_TOKEN_URI,
			auth_provider_x509_cert_url:
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
			client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
			universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
		};

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
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to delete short URL" });
	}
}

async function handleShortenPut(req: any, res: any) {
	const { shortCodeInput } = req.params;
	const { url } = req.body || {};

	if (!shortCodeInput || !url) {
		return res.status(400).json({ error: "Short code and URL are required" });
	}

	try {
		const { google } = await import("googleapis");

		const credentials = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
			auth_uri: process.env.GOOGLE_AUTH_URI,
			token_uri: process.env.GOOGLE_TOKEN_URI,
			auth_provider_x509_cert_url:
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
			client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
			universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
		};

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
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to update short URL" });
	}
}

async function handleShortCodeGet(req: any, res: any) {
	const { shortCodeInput } = req.params;

	if (!shortCodeInput) {
		return res.status(400).json({ error: "Short code is required" });
	}

	try {
		const { google } = await import("googleapis");

		const credentials = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
			auth_uri: process.env.GOOGLE_AUTH_URI,
			token_uri: process.env.GOOGLE_TOKEN_URI,
			auth_provider_x509_cert_url:
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
			client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
			universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
		};

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
	} catch (error) {
		console.error("Error details:", error);
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

		const credentials = {
			type: "service_account",
			project_id: process.env.GOOGLE_PROJECT_ID,
			private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
			private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			client_id: process.env.GOOGLE_CLIENT_ID,
			auth_uri: process.env.GOOGLE_AUTH_URI,
			token_uri: process.env.GOOGLE_TOKEN_URI,
			auth_provider_x509_cert_url:
				process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
			client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
			universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
		};

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
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to retrieve short URL stats" });
	}
}
