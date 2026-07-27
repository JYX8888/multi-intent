import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel, type Api, type BuiltinProvider, type Model } from "@earendil-works/pi-ai/compat";
import type { AppConfig } from "../infrastructure/config.js";
import { intentPlannerPrompt } from "./intent-planner-prompt.js";

export type IntentAgentFactory = (signal: AbortSignal) => Agent;

export function createIntentAgentFactory(config: AppConfig): IntentAgentFactory {
  const model = resolveIntentModel(config);
  return (signal) => createRequestAgent(model, config, signal);
}

export function resolveIntentModel(config: AppConfig): Model<Api> {
  if (config.modelBaseUrl) return createOpenAiCompatibleModel(config);

  const model = getModel(config.modelProvider as BuiltinProvider, config.modelName as never);
  if (!model) throw new Error(`Pi model is not available: ${config.modelProvider}/${config.modelName}`);
  return model;
}

function createOpenAiCompatibleModel(config: AppConfig): Model<"openai-completions"> {
  return {
    id: config.modelName,
    name: config.modelName,
    api: "openai-completions",
    provider: config.modelProvider,
    baseUrl: config.modelBaseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

function createRequestAgent(model: Model<Api>, config: AppConfig, requestSignal: AbortSignal): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: intentPlannerPrompt,
      model,
      thinkingLevel: "off",
      tools: [],
      messages: [],
    },
    getApiKey: () => config.modelApiKey,
  });

  requestSignal.addEventListener("abort", () => agent.abort(), { once: true });
  return agent;
}

export function getFinalAssistantText(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}
