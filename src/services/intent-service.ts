import type { Agent } from "@earendil-works/pi-agent-core";
import { getFinalAssistantText, type IntentAgentFactory } from "../agent/intent-agent.js";
import { ConcurrencyLimitError, type ConcurrencyLimiter } from "../infrastructure/concurrency-limiter.js";
import { parseIntentPlan, type IntentPlan } from "../schema/intent-schema.js";

export class IntentServiceError extends Error {
  constructor(
    public readonly code: "aborted" | "model_error" | "invalid_plan" | "queue_full" | "queue_timeout",
    message: string,
  ) {
    super(message);
  }
}

export type IntentService = {
  plan(message: string, signal: AbortSignal): Promise<IntentPlan>;
};

export function createIntentService(
  createAgent: IntentAgentFactory,
  modelTimeoutMs = 8_000,
  limiter?: ConcurrencyLimiter,
): IntentService {
  return {
    async plan(message, signal) {
      if (signal.aborted) throw new IntentServiceError("aborted", "Request was cancelled.");

      const execute = async (executionSignal: AbortSignal) => await runAgentPlan(createAgent, modelTimeoutMs, message, signal, executionSignal);

      try {
        return limiter ? await limiter.run(execute, signal) : await execute(signal);
      } catch (error) {
        if (error instanceof ConcurrencyLimitError) {
          throw new IntentServiceError(error.code, error.message);
        }
        throw error;
      }
    },
  };
}

async function runAgentPlan(
  createAgent: IntentAgentFactory,
  modelTimeoutMs: number,
  message: string,
  requestSignal: AbortSignal,
  executionSignal: AbortSignal,
): Promise<IntentPlan> {
  const modelController = new AbortController();
  const abortModel = () => modelController.abort();
  const timeout = setTimeout(abortModel, modelTimeoutMs);
  requestSignal.addEventListener("abort", abortModel, { once: true });
  executionSignal.addEventListener("abort", abortModel, { once: true });

  let agent: Agent;
  try {
    agent = createAgent(modelController.signal);
    await agent.prompt(message);
    const finalMessage = agent.state.messages.at(-1);
    if (finalMessage?.role === "assistant" && finalMessage.stopReason === "error") {
      throw new IntentServiceError("model_error", toSafeErrorMessage(finalMessage.errorMessage));
    }
  } catch (error) {
    if (error instanceof IntentServiceError) throw error;
    if (requestSignal.aborted || executionSignal.aborted || modelController.signal.aborted) {
      throw new IntentServiceError("aborted", "Request was cancelled.");
    }
    throw new IntentServiceError("model_error", toSafeErrorMessage(error));
  } finally {
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", abortModel);
    executionSignal.removeEventListener("abort", abortModel);
  }

  try {
    return parseIntentPlan(getFinalAssistantText(agent.state.messages));
  } catch {
    throw new IntentServiceError("invalid_plan", "Model returned an invalid intent plan.");
  }
}

function toSafeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error.slice(0, 200);
  return error instanceof Error ? error.message.slice(0, 200) : "Model request failed.";
}
