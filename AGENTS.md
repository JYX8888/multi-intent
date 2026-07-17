# 项目开发指南

## 1. 项目定位

本项目是一个面向生产环境的 AI 多意图健康管理编排服务。

现有业务基线是 workspace 根目录下的 `dify小诺工作流.yml`。该工作流已经实现“小诺”的饮食、运动、睡眠、体重、尿酮和常见健康问题处理，但目前采用单意图分类和单分支回复，无法完整处理一条消息中的多个业务信息。

典型输入：

```text
今天 80kg，尿酮 2+，中午吃了一碗面，昨晚只睡了 5 小时。
```

目标流程：

```text
用户输入
↓
Pi 识别全部相关意图
↓
生成结构化任务计划
↓
并行调用一个或多个业务 Tool
↓
收集成功、失败和超时结果
↓
生成一条统一、自然的回复
```

本项目使用 Pi Agent Core 作为 Agent Runtime。Pi 负责理解请求、选择工具、执行 Agent Loop、管理多工具调用和生成最终回复；业务计算、健康安全规则、外部服务治理和数据处理由本项目负责。

## 2. 现有 Dify 工作流基线

`dify小诺工作流.yml` 当前包含 144 个节点和 177 条边，核心链路包括：

- 第一层闲聊、非闲聊和表情分类；
- 用户档案、聊天记录、干预方案和产品清单加载；
- 附件、文档识别和意图改写；
- 六类业务意图分类；
- 各业务分支独立生成并直接回复。

当前“意图分类”节点是六选一：

- 饮食点评；
- 运动点评；
- 睡眠点评；
- 体重点评；
- 尿酮点评；
- 常见问题处理。

其提示词明确采用以下互斥优先级：

```text
饮食 > 运动 > 睡眠 > 体重 > 尿酮 > 常见问题
```

这意味着一条消息同时包含饮食、体重和尿酮时，只会进入最高优先级分支。六条分支又分别连接独立的 `answer` 节点，因此当前图中没有多结果汇聚和统一回复能力。

后续修改前必须先查看原工作流对应节点，不得仅依据本指南猜测 Dify 的输入、输出或业务规则。

## 3. 改造目标与边界

本项目不是重写整个“小诺”，而是在现有专业能力外增加一个多意图编排层。

改造原则：

1. 保留现有 Dify 专业分析能力；
2. 将互斥意图分支拆成可独立调用的 Workflow；
3. 将每个 Workflow 包装成 Pi Tool；
4. Pi 一次选择零个、一个或多个 Tool；
5. 无依赖的 Tool 默认并行执行；
6. Tool 返回结构化结果，不直接结束用户会话；
7. Pi 在所有 Tool 完成后统一生成最终回复。

当前阶段只处理单轮请求，不引入 Pi 长期记忆、会话历史管理、多 Agent、LangGraph、CrewAI、消息队列或微服务拆分。

## 4. 目标技术架构

```text
用户请求
↓
API 服务层
↓
请求级上下文准备
↓
Pi Agent Orchestrator
├── 生成多意图任务计划
├── 调用 diet_review
├── 调用 weight_review
├── 调用 ketone_review
├── 调用 exercise_review
├── 调用 sleep_review
└── 调用 health_faq
↓
Tool Adapter
↓
拆分后的 Dify Workflow / 业务服务
↓
结构化 Tool Result
↓
Pi 统一回复
```

闲聊和纯表情可以由 Agent 直接回复，不应为了形式统一而调用业务 Tool。

## 5. 计划中的 Tool 边界

第一阶段建议提供以下 Tool：

### `diet_review`

来源于现有“饮食点评”链路。该链路包含食材清单生成、产品关键词提取、产品库和食物库检索、方案及阶段判断、缺失食物处理和最终饮食点评。

输入应显式包含与饮食任务相关的文本、附件摘要、食材信息、用户方案及必要上下文。不要让 Tool 从隐式会话变量猜测输入。

### `weight_review`

来源于现有“体重点评”链路。负责提取当前体重、读取初始体重和近期体重趋势并生成点评。

数值解析、单位归一化和趋势计算应优先由代码完成，不能完全依赖 LLM。

### `ketone_review`

来源于现有“尿酮点评”链路。负责处理用户文字或试纸图片摘要中的尿酮结果。

尿酮值提取、合法值校验和安全边界必须有明确代码规则；不确定时返回无法判断，不得编造。

### `exercise_review`

来源于现有“运动点评”链路。负责运动类型、时长、强度、感受和安全建议。

### `sleep_review`

来源于现有“睡眠点评”链路。负责入睡时间、睡眠时长和睡眠状态分析。

时间解析和规则矩阵判断应尽量由代码控制。

### `health_faq`

来源于现有“常见问题处理”链路。负责不能归入上述专项 Tool 的健康管理咨询，并遵守医疗安全边界。

不得把闲聊作为 `health_faq` 的默认调用理由。

## 6. 共享上下文与服务边界

现有 Dify 工作流会加载：

- 用户档案；
- 干预方案；
- 产品购买清单；
- 最近聊天记录；
- 最近体重记录；
- 附件和文档摘要；
- 服务方案及服务阶段。

这些能力应由请求级 Context Service 或业务 Service 负责，而不是在每个 Tool 中重复实现。共享数据应按最小必要原则传入 Tool。

第一阶段不实现 Pi 对话记忆。若为了兼容现有业务需要最近聊天记录，应将其视为外部服务提供的请求上下文，而不是 Agent 自己维护的长期历史。

业务代码负责权限、超时、重试、限流、日志、监控、数据持久化和敏感信息脱敏。Pi 不承担这些职责。

## 7. Agent 计划与多意图规则

Agent 必须识别消息中的全部独立业务任务，不得沿用“命中高优先级后忽略其他意图”的规则。

任务计划应是可验证的结构化数据，至少包含：

- 意图类型；
- 目标 Tool；
- 任务相关参数；
- 对应的原文证据或片段；
- 是否可并行执行。

计划主要用于执行和可观测性，不要求将内部推理过程原样展示给用户。

同一 Tool 在一轮中原则上只调用一次：应先合并同类信息，再发起调用。无依赖的 Tool 使用 Pi 默认并行工具执行；存在明确依赖时才设置为顺序执行。

## 8. Tool Schema 与结果协议

每个 Tool 必须具有：

- 清晰且稳定的名称；
- 帮助模型正确选择的 description；
- 严格的 TypeBox 参数 Schema；
- 明确的结构化结果；
- 超时、取消和错误处理；
- 不记录敏感数据的日志策略。

建议统一结果语义：

```ts
interface HealthToolResult<TData> {
  intent: string;
  status: "success" | "partial" | "failed";
  summary: string;
  data?: TData;
  warnings: string[];
  errorCode?: string;
}
```

Tool Adapter 负责参数校验、调用 Dify Workflow、转换错误和标准化返回。Dify Workflow 不应直接返回最终用户会话，而应返回可供 Pi 汇总的结果。

部分 Tool 失败时，其他成功结果仍应进入最终回复。最终回复应明确说明无法完成的部分，但不得暴露内部堆栈、Token、API Key 或服务地址。

## 9. Pi 使用规范

生产代码优先使用 Pi 公开 API，不复制 Pi 内核源码，不直接修改 `node_modules`。

涉及 Pi 内核机制时必须说明：

1. 使用了 Pi 的哪个能力；
2. 对应源码文件或类型；
3. 主要调用流程；
4. 为什么采用该设计。

本项目重点学习和使用：

- `Agent` 与 `AgentState`；
- `AgentMessage`；
- `AgentTool` 与 Tool Schema；
- Tool Call 与 Tool Result；
- `AgentEvent`；
- 并行工具执行；
- `AbortSignal`；
- 模型适配层。

核心调用链：

```text
Agent.prompt()
→ Agent Loop
→ 模型产生一个或多个 Tool Call
→ 参数校验与 Tool 执行
→ Tool Result Message
→ 下一轮模型调用
→ 统一最终回复
```

参考 Pi 源码：

- `../pi/packages/agent/src/agent.ts`
- `../pi/packages/agent/src/agent-loop.ts`
- `../pi/packages/agent/src/types.ts`
- `../pi/packages/ai/src/types.ts`
- `../pi/packages/ai/src/utils/validation.ts`

若确需修改 Pi，必须先说明原因、评估公开 API 或业务层替代方案，并保留修改记录。

## 10. 项目结构规范

```text
src/
├── agent/
│   ├── agent-factory.ts
│   ├── prompts.ts
│   ├── plan-types.ts
│   └── types.ts
├── tools/
│   ├── diet-tool.ts
│   ├── weight-tool.ts
│   ├── ketone-tool.ts
│   ├── exercise-tool.ts
│   ├── sleep-tool.ts
│   ├── health-faq-tool.ts
│   └── tool-types.ts
├── services/
│   ├── dify-client.ts
│   ├── context-service.ts
│   └── workflow-service.ts
├── api/
│   └── routes.ts
├── domain/
│   ├── health-context.ts
│   └── business-rules.ts
├── infrastructure/
│   ├── config.ts
│   └── logger.ts
└── index.ts

experiments/
tests/
docs/
```

禁止：

- 所有逻辑集中在一个文件；
- Agent 配置、Dify 调用和业务规则混合；
- Tool 内部堆积完整业务 Workflow；
- 为未来需求提前设计复杂抽象。

## 11. TypeScript 与依赖规范

项目使用 Node.js、TypeScript 和 npm。

- 开启严格类型检查；
- 使用 2 空格缩进；
- 使用 Prettier 和 ESLint；
- 避免 `any`，确需使用时说明原因；
- 优先用 `interface` 或 `type` 描述边界数据；
- 函数和变量名称必须明确表达职责；
- 不直接修改第三方包源码；
- 不提交 `node_modules`；
- 提交 `package.json` 和 `package-lock.json`。

新增生产依赖前必须说明用途、生产/开发属性和可替代方案。

## 12. 测试与验收要求

新增功能必须包含测试。第一阶段核心验收用例：

```text
输入：今天80kg，尿酮2+，中午吃了一碗面
预期计划：weight_review + ketone_review + diet_review
预期执行：三个 Tool 各调用一次，可并行执行
预期输出：一条包含三类结果的统一回复
```

还必须覆盖：

- 单意图只调用一个 Tool；
- 同类多条信息合并为一次 Tool 调用；
- 闲聊和表情不调用专业 Tool；
- Tool 参数校验失败；
- 单个 Tool 超时或失败；
- 多 Tool 部分成功；
- 模型漏选 Tool；
- Agent 被 `AbortSignal` 取消；
- 最终回复不泄露内部错误和敏感信息。

模拟 Tool 阶段不得调用真实 Dify。使用可控的 fake/faux provider 验证 Agent Loop、事件顺序、Tool Call 和 Tool Result。

## 13. 日志、安全与环境配置

生产代码必须支持请求 ID、Agent 事件、Tool 名称、执行状态、耗时和错误码。日志不得记录用户原始健康数据、完整档案、API Key 或 Token。

所有敏感配置通过 `.env` 读取，并提供 `.env.example`：

```dotenv
MODEL_PROVIDER=
MODEL_NAME=
MODEL_API_KEY=
DIFY_BASE_URL=
DIFY_API_KEY=
```

现有 `dify小诺工作流.yml` 中包含明文鉴权配置。迁移时不得把这些值复制进源码、测试、文档或日志；应迁移到安全配置系统，并评估密钥轮换。未经明确要求，不修改原工作流文件。

## 14. Git 与 AI Coding 工作流

提交示例：

```text
feat: add diet review tool
fix: handle partial tool timeout
docs: document workflow split
```

一次提交只对应一个明确任务。禁止强制重置、删除分支、大范围删除或覆盖用户未提交修改。

修改代码前必须：

1. 阅读相关代码和工作流节点；
2. 总结当前实现；
3. 给出本次修改计划；
4. 列出准备修改或新增的文件；
5. 说明验收标准；
6. 等待用户确认。

修改完成后必须：

1. 报告修改文件；
2. 解释主要调用链及其对应的 Pi 概念；
3. 运行类型检查；
4. 运行相关测试；
5. 如实报告命令和结果；
6. 说明尚未解决的问题和风险。

不得声称未实际执行的测试已经通过，不得顺便重构无关代码。

## 15. 当前阶段目标

第一阶段：

- 建立严格 TypeScript 项目骨架；
- 使用模拟 Tool 完成 Pi Agent 初始化；
- 验证多意图计划；
- 验证多 Tool 并发；
- 验证结构化 Tool Result；
- 验证统一回复生成。

第二阶段：

- 拆分现有 Dify 六类业务链路；
- 接入 Tool Adapter；
- 接入请求级用户上下文；
- 完善超时、取消和部分失败处理。

第三阶段：

- 提供 API 服务；
- 完成日志、监控、限流和安全控制；
- 进行性能、稳定性和生产验收。
