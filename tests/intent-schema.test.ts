import assert from "node:assert/strict";
import { parseIntentPlan } from "../src/schema/intent-schema.js";

const emptyPlan = {
  diet: false,
  diet_content: null,
  weight: false,
  weight_content: null,
  ketone: false,
  ketone_content: null,
  exercise: false,
  exercise_content: null,
  sleep: false,
  sleep_content: null,
  health_faq: false,
  health_faq_content: null,
};

assert.deepEqual(parseIntentPlan(JSON.stringify(emptyPlan)), emptyPlan);
assert.equal(parseIntentPlan(JSON.stringify({ ...emptyPlan, weight: true, weight_content: "今天80kg" })).weight, true);
assert.throws(() => parseIntentPlan(JSON.stringify({ ...emptyPlan, extra: true })));
assert.throws(() => parseIntentPlan(JSON.stringify({ ...emptyPlan, diet: true })));
console.log("intent-schema.test.ts passed");
