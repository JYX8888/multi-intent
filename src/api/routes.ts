import { randomUUID, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getMissingReadyConfig, type AppConfig } from "../infrastructure/config.js";
import type { Logger } from "../infrastructure/logger.js";
import { IntentServiceError, type IntentService } from "../services/intent-service.js";

const maxBodyBytes = 32 * 1024;

export type RouteDependencies = {
  config: AppConfig;
  intentService: IntentService;
  logger: Logger;
  isDraining?: () => boolean;
  onRequestStart?: () => void;
  onRequestFinish?: () => void;
};

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: RouteDependencies,
): Promise<void> {
  const requestId = request.headers["x-request-id"]?.toString() || randomUUID();
  response.setHeader("x-request-id", requestId);

  if (request.method === "GET" && request.url === "/health/live") {
    writeJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && request.url === "/health/ready") {
    const missing = getMissingReadyConfig(dependencies.config);
    const ready = missing.length === 0 && !dependencies.isDraining?.();
    writeJson(response, ready ? 200 : 503, { status: ready ? "ready" : "not_ready" });
    return;
  }

  if (request.method !== "POST" || request.url !== "/intent-plan") {
    writeJson(response, 404, { error: "Not found", request_id: requestId });
    return;
  }

  if (!isAuthorized(request, dependencies.config.intentApiToken)) {
    writeJson(response, 401, { error: "Unauthorized", request_id: requestId });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.config.requestTimeoutMs);
  const onAborted = () => controller.abort();
  request.once("aborted", onAborted);

  try {
    const payload = await readJsonBody(request);
    if (!isRecord(payload) || typeof payload.message !== "string" || payload.message.trim().length === 0) {
      writeJson(response, 400, { error: "message must be a non-empty string", request_id: requestId });
      return;
    }

    const plan = await dependencies.intentService.plan(payload.message, controller.signal);
    if (!response.destroyed) writeJson(response, 200, plan);
  } catch (error) {
    if (response.destroyed) return;
    const status = error instanceof BodyError || error instanceof IntentServiceError ? getStatus(error) : 500;
    const message = error instanceof BodyError || error instanceof IntentServiceError ? error.message : "Internal server error.";
    dependencies.logger.error("intent request failed", { requestId, status });
    writeJson(response, status, { error: message, request_id: requestId });
  } finally {
    clearTimeout(timeout);
    request.off("aborted", onAborted);
  }
}

class BodyError extends Error {}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new BodyError("Request body is too large.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new BodyError("Request body must be valid JSON.");
  }
}

function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  if (!expectedToken) return false;

  const headerToken = request.headers["x-intent-token"]?.toString()?.trim();
  if (headerToken) return constantTimeEqual(headerToken, expectedToken);

  const authorization = request.headers.authorization;
  const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!authValue) return false;

  const match = /^Bearer\s+(.+)$/i.exec(authValue.trim());
  const bearerToken = match?.[1]?.trim();
  if (!bearerToken) return false;
  return constantTimeEqual(bearerToken, expectedToken);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return nodeTimingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function getStatus(error: BodyError | IntentServiceError): number {
  if (error instanceof BodyError) return 400;
  if (error.code === "aborted") return 408;
  if (error.code === "queue_timeout") return 503;
  if (error.code === "queue_full") return 503;
  return 502;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
