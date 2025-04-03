import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import { generateShortCode } from "../helper/generateShortCode";
import { rateLimiter } from "../middleware/rateLimiter";
import type { Request, Response } from "express-serve-static-core";

// Load environment variables first

const app = express();
const port = 3000;
dotenv.config();

app.use(express.json());

app.use(rateLimiter(5, 60 * 1000)); // 10 requests per minute, 1 minute window

// Create credentials object from environment variables
const credentials = {
	type: "service_account",
	project_id: process.env.GOOGLE_PROJECT_ID,
	private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
	private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"), // Replace escaped newlines
	client_email: process.env.GOOGLE_CLIENT_EMAIL,
	client_id: process.env.GOOGLE_CLIENT_ID,
	auth_uri: process.env.GOOGLE_AUTH_URI,
	token_uri: process.env.GOOGLE_TOKEN_URI,
	auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
	client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
	universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
};

const GAuth = new google.auth.GoogleAuth({
	credentials,
	scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheet = google.sheets({
	version: "v4",
	auth: GAuth,
});

type BaseType = {
	id: string;
	url: string;
	shortCode: string;
	createdAt: string;
	updatedAt: string;
	count: number;
};

// GET /
// Just return a simple message
app.get("/", (req: Request, res: Response) => {
	res.send("Welcome to the URL Shortener API!");
});

/*POST /shorten
{
  "url": "https://www.example.com/some/long/url"
} */
app.post("/shorten", async (req: Request, res: Response) => {
	const { url, shortCodeInput } = req.body;

	// Early return if URL is missing
	if (!url) {
		res.status(400).json({ error: "URL is required" });
	}

	try {
		// Check if shortCodeInput exists and is already in use
		if (shortCodeInput) {
			const spreadsheetId = process.env.SPREADSHEET_ID || "";
			const range = "Sheet1!C:C"; // Assuming short codes are in column C

			const response = await sheet.spreadsheets.values.get({
				spreadsheetId,
				range,
			});

			const existingShortCodes = response.data.values?.flat() || [];

			// If short code already exists, return error
			if (existingShortCodes.includes(shortCodeInput)) {
				res.status(400).json({ error: "Short code already in use" });
				return;
			}
		}

		// Generate a simple ID using timestamp + random number
		const id = `id_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

		// Use shortCodeInput if provided, otherwise generate a new short code
		const shortCode = shortCodeInput || generateShortCode();

		// Create timestamps
		const timestamp = new Date().toISOString();

		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const range = "Sheet1!A:F";

		// Create the complete record
		const record: BaseType = {
			id,
			url,
			shortCode,
			createdAt: timestamp,
			updatedAt: timestamp,
			count: 0,
		};

		// Save to Google Sheets with all fields
		await sheet.spreadsheets.values.append({
			spreadsheetId,
			range,
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

		// Return the complete record
		res.status(201).json(record);
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to create short URL" });
	}
});

// DELETE /shorten/:shortCodeInput
app.delete("/shorten/:shortCodeInput", async (req: Request, res: Response) => {
	const { shortCodeInput } = req.params;

	if (!shortCodeInput) {
		res.status(400).json({ error: "Short code is required" });
		return;
	}

	try {
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const range = "Sheet1!C:C"; // Assuming short codes are in column C

		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range,
		});

		const existingShortCodes = response.data.values?.flat() || [];

		if (!existingShortCodes.includes(shortCodeInput)) {
			res.status(404).json({ error: "Short code not found" });
			return;
		}

		// delete the row
		const rowIndex = existingShortCodes.indexOf(shortCodeInput) + 1; // +1 for 1-based index
		const deleteRange = `Sheet1!A${rowIndex}:E${rowIndex}`;
		await sheet.spreadsheets.values.clear({
			spreadsheetId,
			range: deleteRange,
		});

		// Logic to delete the row from Google Sheets would go here
		res.status(200).json({ message: "Short code deleted successfully" });
		return;
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to delete short URL" });
		return;
	}
});

// PUT /shorten/:shortCodeInput
// { "url": "https://www.example.com/new/url" }
app.put("/shorten/:shortCodeInput", async (req: Request, res: Response) => {
	const { shortCodeInput } = req.params;
	const { url } = req.body;

	if (!shortCodeInput || !url) {
		res.status(400).json({ error: "Short code and URL are required" });
		return;
	}

	try {
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const range = "Sheet1!C:C"; // Assuming short codes are in column C

		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range,
		});

		const existingShortCodes = response.data.values?.flat() || [];

		if (!existingShortCodes.includes(shortCodeInput)) {
			res.status(404).json({ error: "Short code not found" });
			return;
		}

		// Logic to update the URL in Google Sheets would go here
		const rowIndex = existingShortCodes.indexOf(shortCodeInput) + 1; // +1 for 1-based index
		const updateRange = `Sheet1!B${rowIndex}`; // Assuming URLs are in column B

		await sheet.spreadsheets.values.update({
			spreadsheetId,
			range: updateRange,
			valueInputOption: "RAW",
			requestBody: {
				values: [[url]],
			},
		});

		res.status(200).json({ message: "Short code updated successfully" });
		return;
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to update short URL" });
		return;
	}
});

// GET /shorten/:shortCodeInput
app.get("/shorten/:shortCodeInput", async (req: Request, res: Response) => {
	const { shortCodeInput } = req.params;

	if (!shortCodeInput) {
		res.status(400).json({ error: "Short code is required" });
		return;
	}

	try {
		const spreadsheetId = process.env.SPREADSHEET_ID || "";
		const range = "Sheet1!C:C"; // Assuming short codes are in column C

		const response = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range,
		});

		const existingShortCodes = response.data.values?.flat() || [];

		if (!existingShortCodes.includes(shortCodeInput)) {
			res.status(404).json({ error: "Short code not found" });
			return;
		}

		const rowIndex = existingShortCodes.indexOf(shortCodeInput) + 1; // +1 for 1-based index
		const urlRange = `Sheet1!B${rowIndex}`; // Assuming URLs are in column B
		const countRange = `Sheet1!F${rowIndex}`; // Assuming counts are in column F

		const urlResponse = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: urlRange,
		});

		const url = urlResponse.data.values?.[0]?.[0];

		const countResponse = await sheet.spreadsheets.values.get({
			spreadsheetId,
			range: countRange,
		});

		// also update the count
		await sheet.spreadsheets.values.update({
			spreadsheetId,
			range: `Sheet1!F${rowIndex}`, // Assuming counts are in column F
			valueInputOption: "RAW",
			requestBody: {
				values: [[Number(countResponse.data.values?.[0]?.[0] || 0) + 1]],
			},
		});

		res.status(200).json({ url });
		return;
	} catch (error) {
		console.error("Error details:", error);
		res.status(500).json({ error: "Failed to retrieve short URL" });
		return;
	}
});

// GET /shorten/:shortCodeInput/stats
app.get(
	"/shorten/:shortCodeInput/stats",
	async (req: Request, res: Response) => {
		const { shortCodeInput } = req.params;

		if (!shortCodeInput) {
			res.status(400).json({ error: "Short code is required" });
			return;
		}

		try {
			const spreadsheetId = process.env.SPREADSHEET_ID || "";
			const range = "Sheet1!C:C"; // Assuming short codes are in column C

			const response = await sheet.spreadsheets.values.get({
				spreadsheetId,
				range,
			});

			const existingShortCodes = response.data.values?.flat() || [];

			if (!existingShortCodes.includes(shortCodeInput)) {
				res.status(404).json({ error: "Short code not found" });
				return;
			}

			const rowIndex = existingShortCodes.indexOf(shortCodeInput) + 1; // +1 for 1-based index
			const countRange = `Sheet1!F${rowIndex}`; // Assuming counts are in column F

			const countResponse = await sheet.spreadsheets.values.get({
				spreadsheetId,
				range: countRange,
			});

			const count = countResponse.data.values?.[0]?.[0];

			res.status(200).json({ count });
			return;
		} catch (error) {
			console.error("Error details:", error);
			res.status(500).json({ error: "Failed to retrieve short URL stats" });
			return;
		}
	},
);

app.listen(port, () => {
	console.log(`Server is running at http://localhost:${port}`);
});

module.exports = app;
