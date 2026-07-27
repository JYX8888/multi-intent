import assert from "node:assert/strict";
import { resolveIntentModel } from "../src/agent/intent-agent.js";
import type { AppConfig } from "../src/infrastructure/config.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
  modelProvider: "qwen",
  modelName: "qwen-plus",
  modelBaseUrl: "https://gateway.example.com/v1",
  modelApiKey: "test-only",
  intentApiToken: "test-token",
  requestTimeoutMs: 10_000,
  modelTimeoutMs: 8_000,
  shutdownGraceMs: 10_000,
  maxModelConcurrency: 100,
  maxQueueSize: 500,
  queueTimeoutMs: 30_000,
};

const customModel = resolveIntentModel(config);
assert.equal(customModel.api, "openai-completions");
assert.equal(customModel.provider, "qwen");
assert.equal(customModel.id, "qwen-plus");
assert.equal(customModel.baseUrl, "https://gateway.example.com/v1");

const builtinModel = resolveIntentModel({ ...config, modelProvider: "deepseek", modelName: "deepseek-v4-flash", modelBaseUrl: "" });
assert.equal(builtinModel.provider, "deepseek");
assert.equal(builtinModel.id, "deepseek-v4-flash");
console.log("intent-agent.test.ts passed");
