import type { Agent } from "@earendil-works/pi-agent-core";
import { getFinalAssistantText, type IntentAgentFactory } from "../agent/intent-agent.js";
import { parseIntentPlan, type IntentPlan } from "../schema/intent-schema.js";

export class IntentServiceError extends Error {
  constructor(
    public readonly code: "aborted" | "model_error" | "invalid_plan",
    message: string,
  ) {
    super(message);
  }
}

export type IntentService = {
  plan(message: string, signal: AbortSignal): Promise<IntentPlan>;
};

export function createIntentService(createAgent: IntentAgentFactory, modelTimeoutMs = 8_000): IntentService {
  return {
    async plan(message, signal) {
      if (signal.aborted) throw new IntentServiceError("aborted", "Request was cancelled.");

      const modelController = new AbortController();
      const abortModel = () => modelController.abort();
      const timeout = setTimeout(abortModel, modelTimeoutMs);
      signal.addEventListener("abort", abortModel, { once: true });

      let agent: Agent;
      try {
        agent = createAgent(modelController.signal);
        await agent.prompt(message);
      } catch (error) {
        if (signal.aborted || modelController.signal.aborted) {
          throw new IntentServiceError("aborted", "Request was cancelled.");
        }
        throw new IntentServiceError("model_error", toSafeErrorMessage(error));
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abortModel);
      }

      try {
        return parseIntentPlan(getFinalAssistantText(agent.state.messages));
      } catch {
        throw new IntentServiceError("invalid_plan", "Model returned an invalid intent plan.");
      }
    },
  };
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "Model request failed.";
}
