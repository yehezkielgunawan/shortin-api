# Shortin v2

Shortin v2 is a URL shortening service built with Express and Google Sheets API. It provides a simple and efficient way to shorten long URLs with features like custom aliases, visit tracking, and basic analytics.

API: [https://shortin-api.yehezgun.com](https://shortin-api.yehezgun.com)

Project idea: [https://roadmap.sh/projects/url-shortening-service](https://roadmap.sh/projects/url-shortening-service)

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

This project supports dual deployment to both Vercel and Cloudflare Workers, allowing you to choose the platform that best fits your needs.

### Vercel Deployment

Deploy to Vercel using the included `vercel.json` configuration:

```bash
vercel --prod
```

### Cloudflare Workers Deployment

This project includes a specialized setup for Cloudflare Workers deployment.

📚 **Quick Links:**
- 📋 [Complete Setup Checklist](CLOUDFLARE_SETUP.md) - Step-by-step deployment guide
- 🔑 [Environment Variables Reference](ENV_VARS_REFERENCE.md) - How secrets persist across deployments

#### Prerequisites
- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)

#### Setup Environment Variables

**Recommended Method: Cloudflare Dashboard**

Configure your environment variables via the Cloudflare Dashboard (easiest for managing secrets with special characters like multiline private keys):

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **shortin-api** → **Settings** → **Variables**
3. Add the following environment variables as **secrets** (encrypted):

**Required:**
- `SPREADSHEET_ID` - Your Google Sheet ID
- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID
- `GOOGLE_PRIVATE_KEY_ID` - Private key ID from service account
- `GOOGLE_PRIVATE_KEY` - Full private key (including BEGIN/END markers and newlines)
- `GOOGLE_CLIENT_EMAIL` - Service account email
- `GOOGLE_CLIENT_ID` - Client ID from service account

**Optional (will use defaults if not provided):**
- `GOOGLE_AUTH_URI`
- `GOOGLE_TOKEN_URI`
- `GOOGLE_AUTH_PROVIDER_X509_CERT_URL`
- `GOOGLE_CLIENT_X509_CERT_URL`
- `GOOGLE_UNIVERSE_DOMAIN`

**Alternative Method: Wrangler CLI**

You can also set secrets via command line if preferred:

```bash
# Set each environment variable (you'll be prompted to enter the value)
wrangler secret put SPREADSHEET_ID
wrangler secret put GOOGLE_PROJECT_ID
wrangler secret put GOOGLE_PRIVATE_KEY_ID
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put GOOGLE_CLIENT_EMAIL
wrangler secret put GOOGLE_CLIENT_ID
# ... etc
```

**Note:** The dashboard method is recommended for `GOOGLE_PRIVATE_KEY` as it handles multiline content better.

#### Deploy Commands

```bash
# Build and preview locally
pnpm cloudflare:preview

# Build and deploy to production
pnpm cloudflare:deploy
```

#### CI/CD with GitHub Actions
The project includes a GitHub Actions workflow for automated Cloudflare Workers deployment.

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

**Important:** Environment variables for the Worker (Google credentials, etc.) should be configured directly in the Cloudflare Dashboard as described above, not in GitHub Secrets. The GitHub Action only deploys the code; the environment variables are managed separately in Cloudflare.

#### Architecture Notes
- The same Express.js application code runs on both platforms
- Cloudflare Workers uses a custom adapter (`worker.ts`) to bridge Express.js with the Workers runtime
- Vercel deployment uses the traditional Node.js server approach
- Both deployments share the same API endpoints and functionality

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
