import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai/compat";
import { readFileSync, existsSync } from "node:fs";
import { mockHealthTools } from "./tools/mock-health-tools.js";

const DEFAULT_INPUT =
  "小诺，我今天早上空腹称了一下体重是80kg，比前几天感觉没怎么降，有点担心是不是平台期了；上午测了一次尿酮，试纸大概是2+，颜色比昨天深一点；中午因为在外面吃饭，吃了一碗面，还加了几口青菜和一点牛肉，不太确定这顿对我现在的减重方案有没有影响，麻烦你一起帮我看看体重、尿酮和这顿饭的问题。";

function loadLocalEnv(): void {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value;
  }
}

function getAssistantText(messages: AgentMessage[]): string {
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

function formatEvent(event: AgentEvent): string | undefined {
  switch (event.type) {
    case "tool_execution_start":
      return `tool_start ${event.toolName} ${JSON.stringify(event.args)}`;
    case "tool_execution_end":
      return `tool_end ${event.toolName} error=${String(event.isError)}`;
    case "turn_end":
      return `turn_end toolResults=${event.toolResults.length}`;
    case "agent_start":
    case "agent_end":
    case "turn_start":
      return event.type;
    default:
      return undefined;
  }
}

loadLocalEnv();

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error("Missing DEEPSEEK_API_KEY. Export it in the shell or create a local .env before running prototype:real.");
}

const input = process.argv.slice(2).join(" ") || DEFAULT_INPUT;
const model = getModel("deepseek", "deepseek-v4-flash");
if (!model) throw new Error("Pi model catalog does not contain deepseek/deepseek-v4-flash.");

const agent = new Agent({
  initialState: {
    systemPrompt: `你是一个健康管理多意图编排原型。

你必须根据用户的一条自然语言消息，识别其中所有独立健康管理意图，并调用对应工具：
- 用户提到体重、kg、斤、称重、平台期时，调用 weight_review。
- 用户提到尿酮、酮体、试纸、1+、2+、3+、4+ 时，调用 ketone_review。
- 用户提到吃了什么、饮食、食物、餐食、能不能吃时，调用 diet_review。

如果一句话里同时包含多个意图，必须一次性调用多个工具；不要只选择优先级最高的一个。
工具返回后，基于所有工具结果生成一条简洁、自然、统一的中文回复。`,
    model,
    thinkingLevel: "off",
    tools: [...mockHealthTools],
  },
  toolExecution: "parallel",
});

agent.subscribe((event) => {
  const formatted = formatEvent(event);
  if (formatted) console.log(`[event] ${formatted}`);
});

console.log(`[prototype:real] 用户输入：${input}`);
await agent.prompt(input);

console.log("\n[prototype:real] 最终回复:");
console.log(getAssistantText(agent.state.messages));
