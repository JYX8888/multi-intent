import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createIntentAgentFactory } from "../src/agent/intent-agent.js";
import type { AppConfig } from "../src/infrastructure/config.js";

const payloads: Record<string, unknown>[] = [];
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  payloads.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);

  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, delta: { content: "{}" }, finish_reason: null }] })}\n\n`);
  response.end(`data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
});

await listen(server);
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseConfig = createConfig(`http://127.0.0.1:${address.port}/maas/v1`);

try {
  await capturePayload({ ...baseConfig, modelProvider: "deepseek", modelName: "deepseek-v4-flash", modelThinkingFormat: "auto", modelThinkingLevel: "off" });
  assert.deepEqual(payloads[0]?.thinking, { type: "disabled" });

  await capturePayload({ ...baseConfig, modelProvider: "genstudio", modelName: "deepseek-v4-flash", modelThinkingFormat: "thinking", modelThinkingLevel: "off" });
  assert.deepEqual(payloads[1]?.thinking, { type: "disabled" });

  await capturePayload({ ...baseConfig, modelProvider: "genstudio", modelName: "qwen3.6-27b", modelThinkingFormat: "enable_thinking", modelThinkingLevel: "off" });
  assert.equal(payloads[2]?.enable_thinking, false);

  await capturePayload({ ...baseConfig, modelProvider: "genstudio", modelName: "deepseek-v4-flash", modelThinkingFormat: "thinking", modelThinkingLevel: "low" });
  assert.deepEqual(payloads[3]?.thinking, { type: "enabled" });
  assert.equal(payloads[3]?.reasoning_effort, "low");

  await capturePayload({
    ...baseConfig,
    modelProvider: "bailian",
    modelName: "deepseek-v4-flash",
    modelBaseUrl: `http://127.0.0.1:${address.port}/dashscope.aliyuncs.com/compatible-mode/v1`,
    modelThinkingFormat: "auto",
    modelThinkingLevel: "off",
  });
  assert.equal(payloads[4]?.enable_thinking, false);
  assert.equal(payloads[4]?.thinking, undefined);
  assert.equal(getFirstMessageRole(payloads[4]), "system");
  assert.equal(payloads[4]?.store, undefined);
  assert.equal(typeof payloads[4]?.max_tokens, "number");
  assert.equal(payloads[4]?.max_completion_tokens, undefined);

  await capturePayload({
    ...baseConfig,
    modelProvider: "bailian",
    modelName: "qwen-flash",
    modelBaseUrl: `http://127.0.0.1:${address.port}/dashscope.aliyuncs.com/compatible-mode/v1`,
    modelThinkingFormat: "auto",
    modelThinkingLevel: "low",
  });
  assert.equal(payloads[5]?.enable_thinking, true);
  assert.equal(payloads[5]?.thinking, undefined);
  console.log("thinking-payload.test.ts passed");
} finally {
  await close(server);
}

async function capturePayload(config: AppConfig): Promise<void> {
  const agent = createIntentAgentFactory(config)(new AbortController().signal);
  await agent.prompt("test");
}

function createConfig(modelBaseUrl: string): AppConfig {
  return {
    host: "127.0.0.1",
    port: 3000,
    modelProvider: "genstudio",
    modelName: "test",
    modelBaseUrl,
    modelThinkingFormat: "auto",
    modelThinkingLevel: "off",
    modelApiKey: "test-only",
    intentApiToken: "test-token",
    requestTimeoutMs: 10_000,
    modelTimeoutMs: 8_000,
    shutdownGraceMs: 10_000,
    maxModelConcurrency: 1,
    maxQueueSize: 1,
    queueTimeoutMs: 1_000,
  };
}

function getFirstMessageRole(payload: Record<string, unknown> | undefined): unknown {
  const messages = payload?.messages;
  if (!Array.isArray(messages)) return undefined;
  const first = messages[0];
  return typeof first === "object" && first !== null && "role" in first ? first.role : undefined;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
