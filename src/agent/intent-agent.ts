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
  const thinkingFormat = resolveThinkingFormat(config);
  const bailianCompatible = isBailianCompatible(config);
  if (!thinkingFormat && config.modelThinkingLevel !== "off") {
    throw new Error("MODEL_THINKING_LEVEL requires a supported MODEL_THINKING_FORMAT for custom OpenAI-compatible models.");
  }
  if (!thinkingFormat && config.modelThinkingFormat !== "none") {
    throw new Error("Unable to infer thinking control. Set MODEL_THINKING_FORMAT to thinking, enable_thinking, or none.");
  }
  return {
    id: config.modelName,
    name: config.modelName,
    api: "openai-completions",
    provider: config.modelProvider,
    baseUrl: config.modelBaseUrl,
    reasoning: thinkingFormat !== undefined,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
    ...((thinkingFormat || bailianCompatible) ? {
      compat: {
        ...(thinkingFormat ? { thinkingFormat } : {}),
        ...(bailianCompatible ? {
          supportsDeveloperRole: false,
          supportsStore: false,
          maxTokensField: "max_tokens" as const,
        } : {}),
      },
    } : {}),
  };
}

function resolveThinkingFormat(config: AppConfig): "qwen" | "deepseek" | undefined {
  if (config.modelThinkingFormat === "qwen" || config.modelThinkingFormat === "enable_thinking") return "qwen";
  if (config.modelThinkingFormat === "deepseek" || config.modelThinkingFormat === "thinking") return "deepseek";
  if (config.modelThinkingFormat === "none") return undefined;

  if (isBailianCompatible(config)) return "qwen";

  const providerAndEndpoint = `${config.modelProvider}/${config.modelBaseUrl}`.toLowerCase();
  const identifier = `${providerAndEndpoint}/${config.modelName}`.toLowerCase();
  if (identifier.includes("qwen")) return "qwen";
  if (/(deepseek|glm|kimi|mimo|minimax)/.test(identifier)) return "deepseek";
  return undefined;
}

function isBailianCompatible(config: AppConfig): boolean {
  const providerAndEndpoint = `${config.modelProvider}/${config.modelBaseUrl}`.toLowerCase();
  return /(bailian|dashscope|aliyun|model-studio|aliyuncs\.com)/.test(providerAndEndpoint);
}

function createRequestAgent(model: Model<Api>, config: AppConfig, requestSignal: AbortSignal): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: intentPlannerPrompt,
      model,
      thinkingLevel: config.modelThinkingLevel,
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
