import assert from "node:assert/strict";
import { request } from "node:http";
import { createHttpServer } from "../src/infrastructure/http-server.js";
import type { AppConfig } from "../src/infrastructure/config.js";
import type { IntentPlan } from "../src/schema/intent-schema.js";
import type { IntentService } from "../src/services/intent-service.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  modelProvider: "deepseek",
  modelName: "deepseek-v4-flash",
  modelApiKey: "test-only",
  intentApiToken: "test-token",
  requestTimeoutMs: 1000,
  modelTimeoutMs: 800,
  shutdownGraceMs: 1000,
  maxModelConcurrency: 100,
  maxQueueSize: 500,
  queueTimeoutMs: 30_000,
};

const emptyPlan: IntentPlan = {
  diet: false,
  diet_content: null,
  weight: false,
  weight_content: null,
  ketone: false,
  ketone_content: null,
  exercise: false,
  exercise_content: null,
  sleep: false,
  sleep_content: null,
  health_faq: false,
  health_faq_content: null,
};

const intentService: IntentService = {
  async plan(message) {
    if (message === "fail") throw new Error("expected test failure");
    return { ...emptyPlan, diet: message === "diet", diet_content: message === "diet" ? "diet" : null };
  },
};

const server = createHttpServer({
  config,
  intentService,
  logger: { info() {}, error() {} },
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const address = server.address();
assert.ok(address && typeof address !== "string");

try {
  const live = await call(address.port, "GET", "/health/live");
  assert.equal(live.status, 200);

  const ready = await call(address.port, "GET", "/health/ready");
  assert.equal(ready.status, 200);

  const unauthorized = await call(address.port, "POST", "/intent-plan", { message: "diet" });
  assert.equal(unauthorized.status, 401);

  const authorized = await Promise.all([
    call(address.port, "POST", "/intent-plan", { message: "diet" }, "test-token"),
    call(address.port, "POST", "/intent-plan", { message: "weight" }, "test-token"),
  ]);
  assert.equal(authorized[0]?.status, 200);
  assert.equal(authorized[1]?.status, 200);
  assert.equal(authorized[0]?.body.diet, true);
  assert.equal(authorized[1]?.body.diet, false);

  const bearer = await call(address.port, "POST", "/intent-plan", { message: "diet" }, undefined, "Bearer test-token");
  assert.equal(bearer.status, 200);

  const failed = await call(address.port, "POST", "/intent-plan", { message: "fail" }, "test-token");
  assert.equal(failed.status, 500);
  console.log("http-server.test.ts passed");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

const drainingServer = createHttpServer({
  config,
  intentService,
  logger: { info() {}, error() {} },
  isDraining: () => true,
});

await new Promise<void>((resolve) => drainingServer.listen(0, "127.0.0.1", () => resolve()));
const drainingAddress = drainingServer.address();
assert.ok(drainingAddress && typeof drainingAddress !== "string");
try {
  const notReady = await call(drainingAddress.port, "GET", "/health/ready");
  assert.equal(notReady.status, 503);
} finally {
  await new Promise<void>((resolve, reject) => drainingServer.close((error) => (error ? reject(error) : resolve())));
}

type Response = { status: number; body: Record<string, unknown> };

function call(port: number, method: string, path: string, body?: unknown, token?: string, authorization?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = payload ? { "content-type": "application/json" } : {};
    if (token) headers["x-intent-token"] = token;
    if (authorization) headers.authorization = authorization;
    const req = request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
