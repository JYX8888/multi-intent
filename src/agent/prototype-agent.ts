import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import {
  type AssistantMessage,
  type Context,
  type FauxProviderRegistration,
  type Message,
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai/compat";
import { mockHealthTools } from "../tools/mock-health-tools.js";

type PrototypeEvent = {
  type: AgentEvent["type"];
  detail: string;
};

export type PrototypeResult = {
  events: PrototypeEvent[];
  messages: AgentMessage[];
  finalText: string;
};

function getUserText(context: Context): string {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index];
    if (message?.role === "user" && !Array.isArray(message.content)) return message.content;
  }
  return "";
}

function getToolResultSummaries(context: Context): string[] {
  return context.messages
    .filter((message) => message.role === "toolResult")
    .flatMap((message) => message.content)
    .filter((block) => block.type === "text")
    .map((block) => block.text);
}

function createToolCallResponse(context: Context, fallbackInput: string): AssistantMessage {
  const text = getUserText(context) || fallbackInput;

  return fauxAssistantMessage(
    [
      fauxToolCall("weight_review", { text }, { id: "weight-call-1" }),
      fauxToolCall("ketone_review", { text }, { id: "ketone-call-1" }),
      fauxToolCall("diet_review", { text }, { id: "diet-call-1" }),
    ],
    { stopReason: "toolUse" },
  );
}

function createFinalResponse(context: Context): AssistantMessage {
  const summaries = getToolResultSummaries(context);
  return fauxAssistantMessage(
    fauxText(`模拟统一回复：\n${summaries.map((summary) => `- ${summary}`).join("\n")}`),
  );
}

function createFauxRegistration(input: string): FauxProviderRegistration {
  const registration = registerFauxProvider();
  registration.setResponses([
    (context: Context, _options?: SimpleStreamOptions) => createToolCallResponse(context, input),
    (context: Context, _options?: SimpleStreamOptions) => createFinalResponse(context),
  ]);
  return registration;
}

function getLastAssistantMessage(messages: AgentMessage[]): Extract<Message, { role: "assistant" }> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

function getAssistantText(messages: AgentMessage[]): string {
  const lastAssistant = getLastAssistantMessage(messages);
  if (!lastAssistant) return "";
  return lastAssistant.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function formatEvent(event: AgentEvent): PrototypeEvent {
  switch (event.type) {
    case "tool_execution_start":
      return { type: event.type, detail: `${event.toolName} ${JSON.stringify(event.args)}` };
    case "tool_execution_end":
      return { type: event.type, detail: `${event.toolName} error=${String(event.isError)}` };
    case "turn_end":
      return { type: event.type, detail: `toolResults=${event.toolResults.length}` };
    case "message_start":
    case "message_end":
      return { type: event.type, detail: event.message.role };
    default:
      return { type: event.type, detail: "" };
  }
}

export async function runPrototype(input: string): Promise<PrototypeResult> {
  const registration = createFauxRegistration(input);
  const events: PrototypeEvent[] = [];

  try {
    const agent = new Agent({
      initialState: {
        systemPrompt: "你是一个多意图健康管理编排原型。识别多个意图，调用对应工具，最后统一回复。",
        model: registration.getModel(),
        thinkingLevel: "off",
        tools: [...mockHealthTools],
      },
      toolExecution: "parallel",
    });

    agent.subscribe((event) => {
      events.push(formatEvent(event));
    });

    await agent.prompt(input);

    return {
      events,
      messages: [...agent.state.messages],
      finalText: getAssistantText(agent.state.messages),
    };
  } finally {
    registration.unregister();
  }
}
