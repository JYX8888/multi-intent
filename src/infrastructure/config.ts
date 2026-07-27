export type AppConfig = {
  host: string;
  port: number;
  modelProvider: string;
  modelName: string;
  modelBaseUrl: string;
  modelApiKey: string;
  intentApiToken: string;
  requestTimeoutMs: number;
  modelTimeoutMs: number;
  shutdownGraceMs: number;
  maxModelConcurrency: number;
  maxQueueSize: number;
  queueTimeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: readPositiveInteger(env.PORT, 3000),
    modelProvider: env.MODEL_PROVIDER?.trim() || "deepseek",
    modelName: env.MODEL_NAME?.trim() || "deepseek-v4-flash",
    modelBaseUrl: readOptionalHttpUrl(env.MODEL_BASE_URL),
    modelApiKey: env.MODEL_API_KEY?.trim() || env.DEEPSEEK_API_KEY?.trim() || "",
    intentApiToken: env.INTENT_API_TOKEN?.trim() || "",
    requestTimeoutMs: readPositiveInteger(env.REQUEST_TIMEOUT_MS, 10_000),
    modelTimeoutMs: readPositiveInteger(env.MODEL_TIMEOUT_MS, 8_000),
    shutdownGraceMs: readPositiveInteger(env.SHUTDOWN_GRACE_MS, 10_000),
    maxModelConcurrency: readPositiveInteger(env.MAX_MODEL_CONCURRENCY, 100),
    maxQueueSize: readPositiveInteger(env.MAX_QUEUE_SIZE, 500),
    queueTimeoutMs: readPositiveInteger(env.QUEUE_TIMEOUT_MS, 30_000),
  };
}

function readOptionalHttpUrl(value: string | undefined): string {
  const url = value?.trim();
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
    return url;
  } catch {
    throw new Error("MODEL_BASE_URL must be a valid http or https URL.");
  }
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
