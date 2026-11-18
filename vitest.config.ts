import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		env: {
			CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
			WRANGLER_SEND_METRICS: "false",
		},
		coverage: {
			reporter: ["text", "json", "html"],
			include: ["helper/**/*.ts", "worker.ts"],
		},
	},
});
