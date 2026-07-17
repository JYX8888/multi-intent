# multi-intent

`multi-intent` 是一个基于 Pi Agent Core 的多意图识别 HTTP 服务。它只负责接收一段健康管理文本，输出固定 JSON 计划，供后续 Dify 工作流调用。

## 功能

- `POST /intent-plan`：多意图识别并返回固定 JSON
- `GET /health/live`：进程存活检查
- `GET /health/ready`：配置就绪检查
- 请求级 `AbortSignal`、超时和优雅关闭
- HTTP Token 鉴权

## 运行环境

- Node.js 22+
- npm 10+
- Pi 模型服务可用

## 安装

本项目已经使用 npm 版本的 Pi 依赖，不需要在生产环境或 Git 仓库中包含同级 `pi/` 源码目录。

```bash
npm ci
```

## 本地启动

1. 创建 `.env`
2. 填入环境变量
3. 启动服务

```bash
npm start
```

默认监听 `0.0.0.0:3000`。

## .env 写法

不要把真实密钥提交到 Git。生产环境也可以继续使用环境变量注入，`.env` 只用于本机或受控环境。

```dotenv
PORT=3000
HOST=0.0.0.0
MODEL_PROVIDER=deepseek
MODEL_NAME=deepseek-v4-flash
MODEL_API_KEY=your-model-api-key
INTENT_API_TOKEN=your-intent-token
REQUEST_TIMEOUT_MS=10000
MODEL_TIMEOUT_MS=8000
SHUTDOWN_GRACE_MS=10000
```

说明：

- `MODEL_PROVIDER` / `MODEL_NAME`：Pi 模型标识
- `MODEL_API_KEY`：模型服务密钥
- `INTENT_API_TOKEN`：调用 `POST /intent-plan` 的内部鉴权 Token
- `REQUEST_TIMEOUT_MS`：整请求超时
- `MODEL_TIMEOUT_MS`：模型调用超时
- `SHUTDOWN_GRACE_MS`：优雅关闭宽限时间

## HTTP 调用方式

### 1. 意图识别

```bash
curl -X POST http://127.0.0.1:3000/intent-plan \
  -H 'Content-Type: application/json' \
  -H 'X-Intent-Token: your-intent-token' \
  -d '{"message":"今天80kg，尿酮2+，中午吃牛肉面，昨晚睡了5小时"}'
```

也可以使用 Bearer 方式：

```bash
curl -X POST http://127.0.0.1:3000/intent-plan \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-intent-token' \
  -d '{"message":"今天80kg，尿酮2+，中午吃牛肉面，昨晚睡了5小时"}'
```

返回示例：

```json
{
  "diet": true,
  "diet_content": "中午吃牛肉面",
  "weight": true,
  "weight_content": "今天80kg",
  "ketone": true,
  "ketone_content": "尿酮2+",
  "exercise": false,
  "exercise_content": null,
  "sleep": true,
  "sleep_content": "昨晚睡了5小时",
  "health_faq": false,
  "health_faq_content": null
}
```

### 2. 健康检查

```bash
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

## 生产部署建议

当前版本未提供 Dockerfile 或 Kubernetes YAML。生产环境建议采用以下方式之一：

### 方案 A：systemd + Node.js

1. 在服务器上安装 Node.js 22+
2. 部署代码到固定目录
3. 通过环境变量或受控 `.env` 提供配置
4. 使用 `npm ci` 和 `npm run build` 构建
5. 用 systemd 启动 `npm start`

示例流程：

```bash
npm ci
npm run build
npm start
```

建议配合 systemd 管理重启、日志和开机自启。

### 方案 B：进程管理器

也可以使用 PM2、supervisord 之类的进程管理器，让服务保持常驻，并在崩溃后自动拉起。

## Dify 对接

Dify 的 HTTP 节点调用本服务时：

- Method：`POST`
- URL：`http://your-host:3000/intent-plan`
- Header：`X-Intent-Token: <token>`
- Body：

```json
{
  "message": "{{用户输入}}"
}
```

Dify 后续节点直接读取返回 JSON 中的六个布尔字段和六个内容字段即可。

## 测试

```bash
npm run typecheck
npm test
```

测试会使用本地 faux provider，不会调用真实模型。

## 代码位置

- Prompt：`src/agent/intent-planner-prompt.ts`
- Agent 初始化：`src/agent/intent-agent.ts`
- 请求处理：`src/api/routes.ts`
- Schema 校验：`src/schema/intent-schema.ts`
- 服务入口：`src/index.ts`

## 注意事项

- 不要提交 `.env`
- 不要把真实健康数据写进日志
- 不要在公开环境暴露未鉴权的 `POST /intent-plan`
- 当前服务只负责意图识别，不负责 Dify、Tool Calling 或最终回复生成
