# Shortin v2

Shortin v2 is a URL shortening service built with Express and Google Sheets API. It provides a simple and efficient way to shorten long URLs with features like custom aliases, visit tracking, and basic analytics.

## Features

- Shorten long URLs into compact, shareable links
- Custom aliases for personalized short links
- Visit tracking and basic analytics
- Rate limiting to prevent API abuse
- Google Sheets integration for data storage

## Prerequisites

- Node.js and npm/pnpm installed
- Google Cloud account with Sheets API enabled
- Google service account credentials

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/shortin-v2.git
   ```

2. Navigate to the project directory:
   ```bash
   cd shortin-v2
   ```

3. Install dependencies:
   ```bash
   npm install
   # or using pnpm
   pnpm install
   ```

4. Create a `.env` file in the root directory with the following variables:
   ```
   SPREADSHEET_ID=your_google_sheet_id
   GOOGLE_PROJECT_ID=your_project_id
   GOOGLE_PRIVATE_KEY_ID=your_private_key_id
   GOOGLE_PRIVATE_KEY=your_private_key
   GOOGLE_CLIENT_EMAIL=your_client_email
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
   GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
   GOOGLE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
   GOOGLE_CLIENT_X509_CERT_URL=your_client_cert_url
   GOOGLE_UNIVERSE_DOMAIN=googleapis.com
   ```

5. Prepare your Google Sheet with the following column structure:
   - Column A: ID
   - Column B: Original URL
   - Column C: Short Code
   - Column D: Created At
   - Column E: Updated At
   - Column F: Visit Count

## Usage

1. Start the development server:
   ```bash
   npm run dev
   # or using pnpm
   pnpm dev
   ```

2. The server will run at `http://localhost:3000`

## API Endpoints

### Welcome Endpoint

- **GET /**
  - Returns a welcome message
  - Response: `"Welcome to the URL Shortener API!"`

### Create Short URL

- **POST /shorten**
  - Creates a new shortened URL
  - Request Body:
    ```json
    {
      "url": "https://www.example.com/some/long/url",
      "shortCodeInput": "custom" // Optional
    }
    ```
  - Response (201):
    ```json
    {
      "id": "id_1620000000000_1234",
      "url": "https://www.example.com/some/long/url",
      "shortCode": "custom", // or auto-generated if not provided
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z",
      "count": 0
    }
    ```
  - Error Response (400): `{"error": "URL is required"}` or `{"error": "Short code already in use"}`

### Access Short URL

- **GET /:shortCodeInput**
  - Redirects to the original URL and increments visit count
  - Response (200):
    ```json
    {
      "url": "https://www.example.com/some/long/url"
    }
    ```
  - Error Response (404): `{"error": "Short code not found"}`

### View URL Statistics

- **GET /shorten/:shortCodeInput/stats**
  - Get visit statistics for a short URL
  - Response (200):
    ```json
    {
      "count": 42
    }
    ```
  - Error Response (404): `{"error": "Short code not found"}`

### Update Short URL

- **PUT /shorten/:shortCodeInput**
  - Update the destination of an existing short URL
  - Request Body:
    ```json
    {
      "url": "https://www.example.com/new/url"
    }
    ```
  - Response (200): `{"message": "Short code updated successfully"}`
  - Error Response (404): `{"error": "Short code not found"}`

### Delete Short URL

- **DELETE /shorten/:shortCodeInput**
  - Delete an existing short URL
  - Response (200): `{"message": "Short code deleted successfully"}`
  - Error Response (404): `{"error": "Short code not found"}`

## Rate Limiting

The API implements rate limiting to prevent abuse:
- Default: 5 requests per minute per IP address
- Headers included in responses:
  - `X-RateLimit-Limit`: Maximum requests allowed per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Timestamp when the rate limit resets

## Deployment

This project can be deployed to Vercel using the included `vercel.json` configuration:

```bash
vercel --prod
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
