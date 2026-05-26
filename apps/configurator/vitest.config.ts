import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["test/main/**/*.test.ts", "test/renderer/**/*.test.{ts,tsx}"],
    exclude: ["test/e2e/**", "node_modules/**", "dist/**"],
    environmentMatchGlobs: [
      ["test/renderer/**", "jsdom"],
      ["test/main/**", "node"],
    ],
  },
});
