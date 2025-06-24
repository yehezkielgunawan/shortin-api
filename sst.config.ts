/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		return {
			name: "shortin-api",
			removal: input?.stage === "production" ? "retain" : "remove",
			protect: ["production"].includes(input?.stage),
			home: "aws",
		};
	},
	async run() {
		const SPREADSHEET_ID = new sst.Secret("SPREADSHEET_ID");
		const KEY = new sst.Secret("KEY");
		const GOOGLE_PROJECT_ID = new sst.Secret("GOOGLE_PROJECT_ID");
		const GOOGLE_PRIVATE_KEY_ID = new sst.Secret("GOOGLE_PRIVATE_KEY_ID");
		const GOOGLE_PRIVATE_KEY = new sst.Secret("GOOGLE_PRIVATE_KEY");
		const GOOGLE_CLIENT_EMAIL = new sst.Secret("GOOGLE_CLIENT_EMAIL");
		const GOOGLE_CLIENT_ID = new sst.Secret("GOOGLE_CLIENT_ID");
		const GOOGLE_AUTH_URI = new sst.Secret("GOOGLE_AUTH_URI");
		const GOOGLE_TOKEN_URI = new sst.Secret("GOOGLE_TOKEN_URI");
		const GOOGLE_AUTH_PROVIDER_X509_CERT_URL = new sst.Secret(
			"GOOGLE_AUTH_PROVIDER_X509_CERT_URL",
		);
		const GOOGLE_CLIENT_X509_CERT_URL = new sst.Secret(
			"GOOGLE_CLIENT_X509_CERT_URL",
		);
		const GOOGLE_UNIVERSE_DOMAIN = new sst.Secret("GOOGLE_UNIVERSE_DOMAIN");

		new sst.aws.Function("Api", {
			handler: "api/index.handler",
			url: true,
			environment: {
				SPREADSHEET_ID: SPREADSHEET_ID.value,
				KEY: KEY.value,
				GOOGLE_PROJECT_ID: GOOGLE_PROJECT_ID.value,
				GOOGLE_PRIVATE_KEY_ID: GOOGLE_PRIVATE_KEY_ID.value,
				GOOGLE_PRIVATE_KEY: GOOGLE_PRIVATE_KEY.value,
				GOOGLE_CLIENT_EMAIL: GOOGLE_CLIENT_EMAIL.value,
				GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID.value,
				GOOGLE_AUTH_URI: GOOGLE_AUTH_URI.value,
				GOOGLE_TOKEN_URI: GOOGLE_TOKEN_URI.value,
				GOOGLE_AUTH_PROVIDER_X509_CERT_URL:
					GOOGLE_AUTH_PROVIDER_X509_CERT_URL.value,
				GOOGLE_CLIENT_X509_CERT_URL: GOOGLE_CLIENT_X509_CERT_URL.value,
				GOOGLE_UNIVERSE_DOMAIN: GOOGLE_UNIVERSE_DOMAIN.value,
			},
		});
	},
});
