import { describe, test, expect } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The migration script runs main() on import and calls process.exit, so it can
// only be exercised as a subprocess.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("pg -> sqlite migration", () => {
  test("fails closed when SOURCE_DATABASE_URL is missing", () => {
    const proc = Bun.spawnSync(["bun", "db/migrate-pg-to-sqlite.js"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        SOURCE_DATABASE_URL: "",
        DATABASE_PATH: "/tmp/diaet-migrate-test.db",
      },
      stderr: "pipe",
    });
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("SOURCE_DATABASE_URL");
  });
});
