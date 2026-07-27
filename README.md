# multi-intent 意图识别服务接入说明

`multi-intent` 是一个健康管理多意图识别 HTTP 服务。调用方传入一段用户原始文本，服务返回固定 JSON，用于判断后续需要进入哪些 Dify 工作流分支。

服务只做意图识别和内容提取，不生成健康建议，不调用业务工作流，也不返回最终用户回复。

Kubernetes 部署方式请参阅 [k8s/README.md](k8s/README.md)。

## 服务配置

服务启动时会自动读取项目目录中的 `.env`，无需先执行 `source .env`。以 `.env.example` 为模板配置 `MODEL_API_KEY` 与 `INTENT_API_TOKEN`；真实 `.env` 已被 Git 忽略，不会提交到仓库。

若使用 Qwen、DeepSeek 代理或其他 OpenAI 兼容厂商，请配置 `MODEL_PROVIDER`、`MODEL_NAME` 和 `MODEL_BASE_URL`。`MODEL_BASE_URL` 填写 API 根地址，通常为 `https://host/v1`，不要填写 `/chat/completions` 完整路径。

## 服务能力

当前识别 6 类意图：

| 字段 | 含义 |
|---|---|
| `diet` | 饮食、食物、餐食、没吃饭等饮食相关信息 |
| `weight` | 体重、称重、体重变化 |
| `ketone` | 尿酮、酮体、试纸结果 |
| `exercise` | 运动、锻炼、步数、运动计划 |
| `sleep` | 睡眠时间、睡眠质量、入睡困难 |
| `health_faq` | 用户提出的健康管理问题或咨询 |

每个意图都有一个对应的内容字段：

```text
diet_content
weight_content
ketone_content
exercise_content
sleep_content
health_faq_content
```

规则：

- 如果某类意图存在，对应布尔字段为 `true`，对应 `*_content` 为文本摘要。
- 如果某类意图不存在，对应布尔字段为 `false`，对应 `*_content` 为 `null`。
- `*_content` 是基于用户原文提取的简短摘要，可能不是逐字截取。
- 用户说“没吃饭”“没有运动”“没测尿酮”等否定表达时，如果这些信息对业务分支有意义，也会作为对应内容返回。

## 输入限制

当前接口只接收文本，不直接接收图片、音频或文件。

如果用户上传午餐照片、尿酮试纸照片等图片，需要先由 Dify 或上游视觉/OCR 服务将图片转换成文字描述，再把文字描述传给本服务。

示例：

```json
{
  "message": "用户上传了一张午餐照片，图片中有一碗牛肉面和一份青菜"
}
```

当前服务可以识别上述文字中的饮食意图；但不能直接识别图片本身。

## 接口地址

```http
POST /intent-plan
```

完整地址由部署方提供，例如：

```text
http://your-host:3000/intent-plan
```

## 鉴权方式

使用 Bearer Token。

请求头：

```http
Authorization: Bearer <token>
```

未携带 Token 或 Token 错误时，服务返回：

```json
{
  "error": "Unauthorized",
  "request_id": "..."
}
```

## 请求格式

```json
{
  "message": "今天80kg，尿酮2+，中午吃牛肉面，昨晚睡了5小时"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `message` | string | 是 | 用户原始输入文本 |

## 返回格式

成功时返回：

```json
{
  "diet": true,
  "diet_content": "中午吃牛肉面",
  "weight": true,
  "weight_content": "80kg",
  "ketone": true,
  "ketone_content": "尿酮2+",
  "exercise": false,
  "exercise_content": null,
  "sleep": true,
  "sleep_content": "睡了5小时",
  "health_faq": false,
  "health_faq_content": null
}
```

返回字段固定为 12 个字段，不会返回额外字段。

## 调用示例

```bash
curl -X POST http://your-host:3000/intent-plan \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-token' \
  -d '{"message":"今天80kg，尿酮2+，中午吃牛肉面，昨晚睡了5小时"}'
```

## Dify HTTP 节点配置

### Method

```text
POST
```

### URL

```text
http://your-host:3000/intent-plan
```

### Headers

```text
Content-Type: application/json
Authorization: Bearer your-token
```

### Body

```json
{
  "message": "{{用户输入}}"
}
```

其中 `{{用户输入}}` 请替换为 Dify 中实际代表用户消息的变量。

## Dify 后续分支建议

Dify 可以根据返回的布尔字段决定是否进入对应工作流：

```text
diet == true          → 饮食点评工作流
weight == true        → 体重点评工作流
ketone == true        → 尿酮点评工作流
exercise == true      → 运动点评工作流
sleep == true         → 睡眠点评工作流
health_faq == true    → 常见问题处理工作流
```

各分支可以使用对应的 `*_content` 作为该分支的输入内容。

例如：

```text
diet_content → 饮食点评输入
weight_content → 体重点评输入
ketone_content → 尿酮点评输入
```

## 更多示例

### 多意图输入

请求：

```json
{
  "message": "早餐吃了两个鸡蛋，今天体重67.5公斤，尿酮试纸是+，上午走了八千步"
}
```

可能返回：

```json
{
  "diet": true,
  "diet_content": "早餐吃了两个鸡蛋",
  "weight": true,
  "weight_content": "体重67.5公斤",
  "ketone": true,
  "ketone_content": "尿酮试纸是+",
  "exercise": true,
  "exercise_content": "上午走了八千步",
  "sleep": false,
  "sleep_content": null,
  "health_faq": false,
  "health_faq_content": null
}
```

### 否定表达

请求：

```json
{
  "message": "今天没称体重，也没有测尿酮，中午准备吃牛肉和西兰花，晚上想慢跑半小时"
}
```

可能返回：

```json
{
  "diet": true,
  "diet_content": "中午准备吃牛肉和西兰花",
  "weight": true,
  "weight_content": "今天没称体重",
  "ketone": true,
  "ketone_content": "没有测尿酮",
  "exercise": true,
  "exercise_content": "晚上想慢跑半小时",
  "sleep": false,
  "sleep_content": null,
  "health_faq": false,
  "health_faq_content": null
}
```

## 错误返回

### 未授权

```json
{
  "error": "Unauthorized",
  "request_id": "..."
}
```

### 请求格式错误

```json
{
  "error": "message must be a non-empty string",
  "request_id": "..."
}
```

### 服务或模型异常

```json
{
  "error": "Model request failed.",
  "request_id": "..."
}
```

调用方应根据 HTTP 状态码和 `error` 字段做兜底处理。
