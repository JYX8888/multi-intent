# Kubernetes 部署说明

本目录将 `multi-intent` 部署为无状态 HTTP 服务。Pod 不保存会话、用户数据或本地业务文件；每个请求独立处理，可由任意副本接收。

## 前置条件

- Kubernetes 集群已安装 Metrics Server，供 HPA 读取 CPU/内存指标。
- 已构建并推送应用镜像。
- Dify 与 Service 处于同一集群网络，或由现有网关暴露服务。

## 构建镜像

在项目根目录执行：

```bash
docker build -t <registry>/multi-intent:<tag> .
docker push <registry>/multi-intent:<tag>
```

将 `deployment.yaml` 中的 `image` 替换为同一镜像地址和标签。

## 配置模型密钥文件

服务启动时会自动读取 `/app/.env`。在 Kubernetes 中，将这个文件以只读 Secret 挂载到容器；不需要在每次启动或每次请求时手工导出环境变量。

先在本地创建不提交 Git 的配置文件，例如 `.env.production`：

```dotenv
MODEL_PROVIDER=qwen
MODEL_NAME=qwen-plus
MODEL_BASE_URL=https://your-openai-compatible-api-root/v1
MODEL_THINKING_FORMAT=enable_thinking
MODEL_THINKING_LEVEL=off
MODEL_API_KEY=replace-with-model-api-key
INTENT_API_TOKEN=replace-with-intent-api-token
```

然后将该文件创建或更新为 Kubernetes Secret：

```bash
kubectl -n multi-intent create secret generic multi-intent-runtime-config \
  --from-file=.env=.env.production \
  --dry-run=client -o yaml | kubectl apply -f -
```

`MODEL_BASE_URL` 必须是 OpenAI 兼容 API 的根地址，通常以 `/v1` 结尾；不要填写完整的 `/chat/completions` 路径。`MODEL_THINKING_FORMAT` 支持 `auto`、`enable_thinking`、`thinking`、`qwen`、`deepseek` 和 `none`。DeepSeek 官方及采用同类协议的平台使用 `thinking`；阿里云百炼/DashScope 托管的 Qwen 和 DeepSeek 模型均使用 `enable_thinking`，`auto` 可以依据 Provider 或百炼 Base URL 自动选择。`MODEL_THINKING_LEVEL=off` 会分别发送 `thinking: { "type": "disabled" }` 或 `enable_thinking: false`。无法自动识别的第三方模型必须显式配置协议，否则 Pod 会启动失败并保持未就绪。`.env.production` 不应提交 Git，也不应复制进镜像。端口、超时和并发参数仍由 `configmap.yaml` 管理。

## 部署

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl -n multi-intent create secret generic multi-intent-runtime-config --from-file=.env=.env.production --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl -n multi-intent rollout status deployment/multi-intent
```

集群内调用地址：

```text
http://multi-intent.multi-intent.svc.cluster.local/intent-plan
```

Service 未提供公网入口。若 Dify 位于集群外，请通过已有 Ingress、API Gateway 或 LoadBalancer 方案暴露 Service，并在该网关层配置 TLS 与访问控制。

## 扩容与终止

- HPA 在 2 到 10 个副本间按 CPU 和内存扩缩容。
- 每个 Pod 最多同时调用 100 次模型，并可在进程内额外排队 500 个请求。模型供应商额度至少应覆盖 `Pod 副本数 × MAX_MODEL_CONCURRENCY`。
- 收到 `SIGTERM` 时，应用先变为 `not_ready`，停止接收新连接，并在最多 30 秒内等待现有请求完成；Kubernetes 的 45 秒终止宽限期留出额外余量。

CPU 对等待外部模型响应的服务不一定敏感。后续建议增加队列长度、活跃模型调用数和请求延迟指标，再使用自定义 HPA 指标做更贴合负载的扩缩容。
