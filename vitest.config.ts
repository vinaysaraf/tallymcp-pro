import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "packages/**/src/**/*.test.ts", "installer/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
