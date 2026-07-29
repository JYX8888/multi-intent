import assert from "node:assert/strict";
import { resolveIntentModel } from "../src/agent/intent-agent.js";
import type { AppConfig } from "../src/infrastructure/config.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
  modelProvider: "qwen",
  modelName: "qwen-plus",
  modelBaseUrl: "https://gateway.example.com/v1",
  modelThinkingFormat: "auto",
  modelThinkingLevel: "off",
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
assert.equal(customModel.reasoning, true);
assert.equal(getThinkingFormat(customModel), "qwen");

const deepseekModel = resolveIntentModel({ ...config, modelProvider: "deepseek", modelName: "deepseek-v4-flash", modelBaseUrl: "https://gateway.example.com/v1" });
assert.equal(getThinkingFormat(deepseekModel), "deepseek");

const bailianDeepseekModel = resolveIntentModel({
  ...config,
  modelProvider: "bailian",
  modelName: "deepseek-v4-flash",
  modelBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
assert.equal(getThinkingFormat(bailianDeepseekModel), "qwen");

const bailianQwenModel = resolveIntentModel({
  ...config,
  modelProvider: "company-gateway",
  modelName: "qwen-flash",
  modelBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
assert.equal(getThinkingFormat(bailianQwenModel), "qwen");

const glmModel = resolveIntentModel({ ...config, modelProvider: "genstudio", modelName: "glm-5", modelBaseUrl: "https://gateway.example.com/v1" });
assert.equal(getThinkingFormat(glmModel), "deepseek");

assert.throws(
  () => resolveIntentModel({ ...config, modelProvider: "custom-vendor", modelName: "custom-model", modelThinkingFormat: "auto" }),
  /Unable to infer thinking control/,
);
assert.throws(
  () => resolveIntentModel({ ...config, modelProvider: "custom-vendor", modelName: "custom-model", modelThinkingFormat: "none", modelThinkingLevel: "low" }),
  /MODEL_THINKING_LEVEL requires/,
);

const builtinModel = resolveIntentModel({ ...config, modelProvider: "deepseek", modelName: "deepseek-v4-flash", modelBaseUrl: "" });
assert.equal(builtinModel.provider, "deepseek");
assert.equal(builtinModel.id, "deepseek-v4-flash");
console.log("intent-agent.test.ts passed");

function getThinkingFormat(model: { compat?: object }): string | undefined {
  const compat = model.compat;
  if (!compat || !("thinkingFormat" in compat)) return undefined;
  const format = compat.thinkingFormat;
  return typeof format === "string" ? format : undefined;
}
