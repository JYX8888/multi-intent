import assert from "node:assert/strict";
import { Agent } from "@earendil-works/pi-agent-core";
import {
  fauxAssistantMessage,
  fauxText,
  registerFauxProvider,
  type Context,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai/compat";
import { createIntentService } from "../src/services/intent-service.js";

const registration = registerFauxProvider();
const plan = {
  diet: true,
  diet_content: "中午吃牛肉面",
  weight: true,
  weight_content: "今天80kg",
  ketone: true,
  ketone_content: "尿酮2+",
  exercise: false,
  exercise_content: null,
  sleep: false,
  sleep_content: null,
  health_faq: false,
  health_faq_content: null,
};

const response = (_context: Context, _options?: SimpleStreamOptions) =>
  fauxAssistantMessage(fauxText(JSON.stringify(plan)));
registration.setResponses([response, response]);

try {
  let created = 0;
  const service = createIntentService((signal) => {
    created += 1;
    const agent = new Agent({
      initialState: { model: registration.getModel(), systemPrompt: "test", tools: [] },
    });
    signal.addEventListener("abort", () => agent.abort(), { once: true });
    return agent;
  });

  const first = await service.plan("今天80kg，尿酮2+，中午吃牛肉面", new AbortController().signal);
  const second = await service.plan("同一进程中的第二个请求", new AbortController().signal);
  assert.equal(first.weight, true);
  assert.equal(second.diet, true);
  assert.equal(created, 2);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.plan("取消", controller.signal), /cancelled/);

  registration.setResponses([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "upstream rejected request" }),
  ]);
  await assert.rejects(service.plan("模型错误", new AbortController().signal), /upstream rejected request/);
  console.log("intent-service.test.ts passed");
} finally {
  registration.unregister();
}
