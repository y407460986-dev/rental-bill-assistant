import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Separate processes keep each rollback-only database suite strictly sequential.
for (const suite of [
  "lib/billing/__tests__/workflow.integration.test.ts",
  "lib/rental/__tests__/draft.integration.test.ts",
]) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", suite],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
