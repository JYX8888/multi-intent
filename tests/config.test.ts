import assert from "node:assert/strict";
import { loadConfig } from "../src/infrastructure/config.js";

const defaults = loadConfig({});
assert.equal(defaults.modelThinkingFormat, "auto");
assert.equal(defaults.modelThinkingLevel, "off");

const explicit = loadConfig({
  MODEL_PROVIDER: "genstudio",
  MODEL_NAME: "deepseek-v4-flash",
  MODEL_BASE_URL: "https://gateway.example.com/v1",
  MODEL_THINKING_FORMAT: "thinking",
  MODEL_THINKING_LEVEL: "off",
});
assert.equal(explicit.modelThinkingFormat, "thinking");
assert.equal(explicit.modelThinkingLevel, "off");

assert.throws(() => loadConfig({ MODEL_THINKING_FORMAT: "unsupported" }), /MODEL_THINKING_FORMAT/);
assert.throws(() => loadConfig({ MODEL_THINKING_LEVEL: "unsupported" }), /MODEL_THINKING_LEVEL/);
console.log("config.test.ts passed");
