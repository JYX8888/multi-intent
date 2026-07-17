export type AppConfig = {
  host: string;
  port: number;
  modelProvider: string;
  modelName: string;
  modelApiKey: string;
  intentApiToken: string;
  requestTimeoutMs: number;
  modelTimeoutMs: number;
  shutdownGraceMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: readPositiveInteger(env.PORT, 3000),
    modelProvider: env.MODEL_PROVIDER?.trim() || "deepseek",
    modelName: env.MODEL_NAME?.trim() || "deepseek-v4-flash",
    modelApiKey: env.MODEL_API_KEY?.trim() || env.DEEPSEEK_API_KEY?.trim() || "",
    intentApiToken: env.INTENT_API_TOKEN?.trim() || "",
    requestTimeoutMs: readPositiveInteger(env.REQUEST_TIMEOUT_MS, 10_000),
    modelTimeoutMs: readPositiveInteger(env.MODEL_TIMEOUT_MS, 8_000),
    shutdownGraceMs: readPositiveInteger(env.SHUTDOWN_GRACE_MS, 10_000),
  };
}

export function getMissingReadyConfig(config: AppConfig): string[] {
  const missing: string[] = [];
  if (!config.modelProvider) missing.push("MODEL_PROVIDER");
  if (!config.modelName) missing.push("MODEL_NAME");
  if (!config.modelApiKey) missing.push("MODEL_API_KEY");
  if (!config.intentApiToken) missing.push("INTENT_API_TOKEN");
  return missing;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
