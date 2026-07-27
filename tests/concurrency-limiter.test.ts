import assert from "node:assert/strict";
import { ConcurrencyLimiter, ConcurrencyLimitError } from "../src/infrastructure/concurrency-limiter.js";

const limiter = new ConcurrencyLimiter(2, 3, 10_000);
let active = 0;
let maxActive = 0;
const releases: Array<() => void> = [];

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function controlledTask(): Promise<number> {
  return limiter.run(
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return maxActive;
    },
    new AbortController().signal,
  );
}

const running = [controlledTask(), controlledTask(), controlledTask(), controlledTask(), controlledTask()];
await nextTick();
assert.equal(limiter.active, 2);
assert.equal(limiter.pending, 3);
await assert.rejects(controlledTask(), (error) => error instanceof ConcurrencyLimitError && error.code === "queue_full");

for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
  await nextTick();
  const batch = releases.splice(0);
  for (const release of batch) release();
}
await Promise.all(running);
assert.equal(maxActive, 2);

const timeoutLimiter = new ConcurrencyLimiter(1, 1, 10);
let releaseLongTask: (() => void) | undefined;
const longTask = timeoutLimiter.run(
  async () => {
    await new Promise<void>((resolve) => {
      releaseLongTask = resolve;
    });
  },
  new AbortController().signal,
);
await nextTick();
await assert.rejects(
  timeoutLimiter.run(async () => undefined, new AbortController().signal),
  (error) => error instanceof ConcurrencyLimitError && error.code === "queue_timeout",
);
releaseLongTask?.();
await longTask;
console.log("concurrency-limiter.test.ts passed");
