# 思考模式并发对比测试报告

## 测试结论

DeepSeek 官方 API 在本次 `100` 并发测试中，完整意图识别服务两组均为 `100/100` 成功。关闭思考的平均处理时长为 `1724.02 ms`，开启低强度思考后为 `2234.10 ms`，增加 `510.08 ms`（约 `29.6%`）。

GenStudio 的原始模型 HTTP 调用同样均为 `100/100` 成功，但完整服务只有 `69/100`（关闭）和 `66/100`（开启）通过固定 JSON Schema；失败响应统一转换为 `502 Model returned an invalid intent plan.`。这说明该平台的主要问题是结构化输出稳定性，不是网络连通性或上游 HTTP 可用性。

阿里云百炼托管的 `deepseek-v4-flash` 在完整服务中关闭和开启思考均为 `100/100` 成功，平均延迟分别为 `2119.87 ms` 和 `2878.62 ms`。百炼 `qwen-flash` 更快但结构化输出不够稳定：关闭思考为 `93/100`，开启思考为 `92/100`；开启思考后成功请求平均延迟从 `1213.17 ms` 上升到 `8873.11 ms`。

## 测试条件

- 日期：2026-07-29
- 并发：每组 100 个请求同时发出；各组顺序执行。
- 模型：`deepseek-v4-flash`；百炼平台额外测试 `qwen-flash`。
- 测试消息：`今天早餐吃了两个鸡蛋，体重70kg，尿酮1+，昨晚睡了7小时。`
- 关闭思考：`MODEL_THINKING_LEVEL=off`。
- 开启思考：`MODEL_THINKING_LEVEL=low`。
- DeepSeek 官方及 GenStudio 使用 `thinking`；百炼托管的 Qwen 和 DeepSeek 均使用 `enable_thinking`。
- 密钥仅从运行时环境读取，未写入本报告、源码或日志。

## 完整服务结果

完整服务路径为：`POST /intent-plan` -> HTTP 路由 -> 并发池 -> Pi Agent -> 模型流式调用 -> JSON 解析 -> 固定 Schema 校验。

| 上游 | 思考 | HTTP 200 | 平均延迟 | P50 | P90 | P95 | P99 | 最大值 | 整批完成 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GenStudio | 关闭 | 69/100 | 4070.94 ms | 2759.60 ms | 3685.16 ms | 4285.82 ms | 51510.92 ms | 51510.92 ms | 51533.05 ms |
| GenStudio | 低强度开启 | 66/100 | 4373.63 ms | 3761.89 ms | 4541.53 ms | 4673.60 ms | 33155.53 ms | 33155.53 ms | 55165.32 ms |
| DeepSeek 官方 | 关闭 | 100/100 | 1724.02 ms | 1729.73 ms | 1897.44 ms | 1937.77 ms | 2226.79 ms | 2254.60 ms | 2271.22 ms |
| DeepSeek 官方 | 低强度开启 | 100/100 | 2234.10 ms | 2136.33 ms | 2583.12 ms | 2722.63 ms | 2949.68 ms | 8907.02 ms | 8907.70 ms |
| 百炼 `deepseek-v4-flash` | 关闭 | 100/100 | 2119.87 ms | 2104.29 ms | 2392.21 ms | 2453.03 ms | 2585.27 ms | 2629.17 ms | 2646.57 ms |
| 百炼 `deepseek-v4-flash` | 低强度开启 | 100/100 | 2878.62 ms | 2760.87 ms | 3462.29 ms | 3552.69 ms | 3667.82 ms | 3851.28 ms | 3854.79 ms |
| 百炼 `qwen-flash` | 关闭 | 93/100 | 1213.17 ms | 1183.51 ms | 1372.67 ms | 1528.64 ms | 1747.12 ms | 1747.12 ms | 1751.99 ms |
| 百炼 `qwen-flash` | 低强度开启 | 92/100 | 8873.11 ms | 8713.50 ms | 10286.56 ms | 11771.28 ms | 19575.22 ms | 19575.22 ms | 19577.29 ms |

说明：平均值、分位数和最大值只计算 HTTP `200` 的成功请求。GenStudio 和百炼 Qwen 的非 200 响应均为固定 JSON Schema 校验失败。

## 纯模型调用证据

为分离服务开销，另行直接调用各上游的 OpenAI-compatible `POST /chat/completions` 接口。请求使用相同模型、系统 Prompt、用户消息和 `stream: true`，从请求开始计时，直到完整读取 SSE 响应结束；不经过本服务 HTTP 路由、Pi Agent Loop、并发池或 Schema 校验。

| 上游 | 思考 | HTTP 200 | 含推理响应 | 平均延迟 | P50 | P90 | P95 | P99 | 最大值 | 整批完成 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| GenStudio 直接调用 | 关闭 | 100/100 | 未统计 | 2600.96 ms | 2459.73 ms | 3092.13 ms | 3312.26 ms | 4664.34 ms | 6059.39 ms | 6087.65 ms |
| GenStudio 直接调用 | 低强度开启 | 100/100 | 未统计 | 4172.68 ms | 3866.24 ms | 5912.95 ms | 6200.81 ms | 8528.69 ms | 9684.90 ms | 9686.72 ms |
| DeepSeek 官方直接调用 | 关闭 | 100/100 | 未统计 | 1651.71 ms | 1588.44 ms | 1970.64 ms | 1998.00 ms | 2320.01 ms | 2440.00 ms | 2446.83 ms |
| DeepSeek 官方直接调用 | 低强度开启 | 100/100 | 未统计 | 2353.31 ms | 2329.48 ms | 2778.75 ms | 2920.52 ms | 3185.78 ms | 3265.13 ms | 未记录 |
| 百炼 `deepseek-v4-flash` 直接调用 | 关闭 | 100/100 | 0/100 | 1772.24 ms | 1752.68 ms | 1925.99 ms | 1965.06 ms | 2133.99 ms | 2182.93 ms | 2187.76 ms |
| 百炼 `deepseek-v4-flash` 直接调用 | 开启 | 100/100 | 100/100 | 2938.32 ms | 2900.09 ms | 3511.31 ms | 3697.27 ms | 4042.09 ms | 4410.18 ms | 4411.45 ms |
| 百炼 `qwen-flash` 直接调用 | 关闭 | 100/100 | 0/100 | 1164.66 ms | 1156.23 ms | 1311.62 ms | 1355.27 ms | 1433.10 ms | 1468.22 ms | 1469.71 ms |
| 百炼 `qwen-flash` 直接调用 | 开启 | 100/100 | 99/100 | 8858.20 ms | 8640.08 ms | 10434.57 ms | 10902.95 ms | 11827.90 ms | 20371.14 ms | 20373.30 ms |

## 对比与判断

- DeepSeek 官方直接调用：开启低强度思考增加 `701.60 ms`，约 `42.5%`。
- DeepSeek 官方完整服务：开启低强度思考增加 `510.08 ms`，约 `29.6%`。
- GenStudio 直接调用：开启低强度思考增加 `1571.72 ms`，约 `60.4%`。
- 百炼 DeepSeek 完整服务：开启思考增加 `758.75 ms`，约 `35.8%`。
- 百炼 Qwen 完整服务：开启思考增加 `7659.94 ms`，约 `631.4%`；该比例只基于通过 Schema 的成功请求。
- 纯模型与完整服务为独立批次，受上游调度和网络波动影响，不能简单以两者相减得出精确的服务固定开销。
- GenStudio 直接调用全部返回 HTTP 200，但完整服务存在大量 Schema 失败；后续应采样保存脱敏的原始模型文本，定位是否为 Markdown、推理文本、字段缺失或额外字段导致。
- 百炼 Qwen 的失败样本在 `sleep_content` 后提前结束，遗漏 `health_faq` 和 `health_faq_content`，属于模型 Schema 遵循失败。

## 复现配置

DeepSeek 官方 API：

```dotenv
MODEL_PROVIDER=deepseek
MODEL_NAME=deepseek-v4-flash
MODEL_BASE_URL=https://api.deepseek.com
MODEL_THINKING_FORMAT=thinking
MODEL_THINKING_LEVEL=off
```

切换为开启低强度思考时，仅修改：

```dotenv
MODEL_THINKING_LEVEL=low
```

## 测试边界

- 本报告只衡量单轮意图提取，不包含 Dify、Tool Calling、数据库或用户历史。
- 本报告的纯模型测试以 HTTP `200` 为成功，不校验模型文本是否符合业务 JSON Schema。
- 强制思考模型可能忽略关闭指令；本报告使用的 `deepseek-v4-flash` 在 DeepSeek 官方 API 下能够完成关闭与开启两种请求。

## 阿里云百炼说明

百炼的两个模型都使用顶层 `enable_thinking`。官方文档说明，百炼托管的 Qwen 和 DeepSeek 混合思考模型均通过该字段开关思考，并使用北京地域 OpenAI 兼容地址 `https://dashscope.aliyuncs.com/compatible-mode/v1`：[深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking)、[DeepSeek API](https://help.aliyun.com/en/model-studio/deepseek-api)。

百炼兼容层使用 `system` 角色、`max_tokens` 和 `enable_thinking`。关闭思考的纯模型响应均不含推理内容；开启后 DeepSeek 的 `100/100` 响应含推理内容，Qwen 为 `99/100`，证明开关已经实际到达模型。

### 配置

```dotenv
MODEL_PROVIDER=bailian
MODEL_NAME=deepseek-v4-flash
MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_THINKING_FORMAT=auto
MODEL_THINKING_LEVEL=off
MODEL_API_KEY=填写百炼APIKey
```

将 `MODEL_NAME` 改为 `qwen-flash` 即可切换模型。将 `MODEL_THINKING_LEVEL` 改为 `low` 会发送 `enable_thinking: true`；保持 `off` 会发送 `enable_thinking: false`。基于本次结果，严格十二字段生产响应优先使用百炼 `deepseek-v4-flash` 并关闭思考。

### 测试边界

- 结果是 2026-07-29 从当前网络环境对北京地域端点的一次实测，不代表上游 SLA。
- 纯模型 HTTP `200` 只证明上游请求成功；完整服务 HTTP `200` 才同时证明固定 Schema 合格。
- 一次额外的 Qwen 顺序抽样在开启思考阶段遇到上游关闭 TLS Socket，因此未计入上表；上表批次本身均完整结束。
- API Key 仅通过测试进程环境传入，未写入源码、配置样例、日志或报告。
