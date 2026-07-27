import { existsSync } from "node:fs";

export function loadEnvFileIfPresent(path = process.env.ENV_FILE?.trim() || ".env"): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
