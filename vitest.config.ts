import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "dist-workers/**",
    ],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      all: true,
      include: [
        "api/**/*.ts",
        "helper/**/*.ts",
        "middleware/**/*.ts",
        "worker.ts",
      ],
      exclude: [
        "test/**",
        "**/*.test.ts",
        "vitest.config.ts",
        "vitest.setup.ts",
        "api/index.ts",
      ],
    },
  },
});
