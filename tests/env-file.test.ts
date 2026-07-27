import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFileIfPresent } from "../src/infrastructure/env-file.js";

const directory = mkdtempSync(join(tmpdir(), "multi-intent-env-"));
const file = join(directory, ".env");
const variableName = "MULTI_INTENT_ENV_FILE_TEST";

try {
  delete process.env[variableName];
  writeFileSync(file, `${variableName}=loaded-from-file\n`, "utf8");

  assert.equal(loadEnvFileIfPresent(file), true);
  assert.equal(process.env[variableName], "loaded-from-file");
  assert.equal(loadEnvFileIfPresent(join(directory, "missing.env")), false);
  console.log("env-file.test.ts passed");
} finally {
  delete process.env[variableName];
  rmSync(directory, { recursive: true, force: true });
}
