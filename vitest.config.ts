import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    // Real database suites share a database and must never overlap, in any mode.
    fileParallelism: false,
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Coverage thresholds apply to deterministic calculation and input contracts.
      include: [
        "lib/calculator/**/*.ts",
        "lib/contracts/**/*.ts",
        "lib/utils/**/*.ts",
      ],
      exclude: ["lib/**/types.ts", "lib/types/**"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
