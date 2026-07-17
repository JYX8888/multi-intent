import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "@earendil-works/pi-ai";

export type MockHealthToolDetails = {
  intent: "diet" | "weight" | "ketone";
  status: "success";
  summary: string;
  evidence: string;
};

type MockHealthToolResult = AgentToolResult<MockHealthToolDetails>;

const textInputSchema = Type.Object({
  text: Type.String({ description: "用户原始消息中与该工具相关的片段" }),
});

type TextInputParams = Static<typeof textInputSchema>;

function createMockResult(details: MockHealthToolDetails): MockHealthToolResult {
  return {
    content: [{ type: "text", text: details.summary }],
    details,
  };
}

export const dietReviewTool: AgentTool<typeof textInputSchema, MockHealthToolDetails> = {
  name: "diet_review",
  label: "饮食点评",
  description: "模拟饮食点评工具。用户提到吃了什么、饮食记录、餐食分析时调用。",
  parameters: textInputSchema,
  execute: async (_toolCallId: string, params: TextInputParams) => {
    console.log(`[mock-tool] diet_review called: ${params.text}`);
    return createMockResult({
      intent: "diet",
      status: "success",
      summary: "饮食模拟结果：已识别到一碗面，正式版本会交给饮食 Workflow 判断推荐等级。",
      evidence: params.text,
    });
  },
};

export const weightReviewTool: AgentTool<typeof textInputSchema, MockHealthToolDetails> = {
  name: "weight_review",
  label: "体重点评",
  description: "模拟体重点评工具。用户登记体重或提到 kg、斤等体重数据时调用。",
  parameters: textInputSchema,
  execute: async (_toolCallId: string, params: TextInputParams) => {
    console.log(`[mock-tool] weight_review called: ${params.text}`);
    return createMockResult({
      intent: "weight",
      status: "success",
      summary: "体重模拟结果：已识别到当前体重 80kg，正式版本会结合初始体重和近 7 天趋势点评。",
      evidence: params.text,
    });
  },
};

export const ketoneReviewTool: AgentTool<typeof textInputSchema, MockHealthToolDetails> = {
  name: "ketone_review",
  label: "尿酮点评",
  description: "模拟尿酮点评工具。用户提到尿酮、酮体、试纸、1+、2+ 等检测结果时调用。",
  parameters: textInputSchema,
  execute: async (_toolCallId: string, params: TextInputParams) => {
    console.log(`[mock-tool] ketone_review called: ${params.text}`);
    return createMockResult({
      intent: "ketone",
      status: "success",
      summary: "尿酮模拟结果：已识别到尿酮 2+，正式版本会按尿酮规则生成安全点评。",
      evidence: params.text,
    });
  },
};

export const mockHealthTools = [dietReviewTool, weightReviewTool, ketoneReviewTool] as const;
