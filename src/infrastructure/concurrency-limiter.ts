type QueueItem = {
  task: (signal: AbortSignal) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  sourceSignal: AbortSignal;
  onAbort: () => void;
};

export class ConcurrencyLimitError extends Error {
  constructor(public readonly code: "queue_full" | "queue_timeout" | "aborted") {
    super(code === "queue_full" ? "Request queue is full." : code === "queue_timeout" ? "Request queue timed out." : "Request was cancelled.");
  }
}

export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly queue: QueueItem[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueSize: number,
    private readonly queueTimeoutMs: number,
  ) {}

  get active(): number {
    return this.activeCount;
  }

  get pending(): number {
    return this.queue.length;
  }

  async run<TValue>(task: (signal: AbortSignal) => Promise<TValue>, signal: AbortSignal): Promise<TValue> {
    if (signal.aborted) throw new ConcurrencyLimitError("aborted");

    if (this.activeCount < this.maxConcurrent) {
      return await this.runNow(task, signal);
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new ConcurrencyLimitError("queue_full");
    }

    return await new Promise<TValue>((resolve, reject) => {
      const controller = new AbortController();
      const onAbort = () => {
        controller.abort();
        this.removeQueuedItem(item);
        reject(new ConcurrencyLimitError("aborted"));
      };
      const timeout = setTimeout(() => {
        controller.abort();
        this.removeQueuedItem(item);
        reject(new ConcurrencyLimitError("queue_timeout"));
      }, this.queueTimeoutMs);

      const item: QueueItem = {
        task: async (taskSignal) => await task(taskSignal),
        resolve: (value) => resolve(value as TValue),
        reject,
        controller,
        timeout,
        sourceSignal: signal,
        onAbort,
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.queue.push(item);
      this.drain();
    });
  }

  private async runNow<TValue>(task: (signal: AbortSignal) => Promise<TValue>, signal: AbortSignal): Promise<TValue> {
    this.activeCount += 1;
    try {
      return await task(signal);
    } finally {
      this.activeCount -= 1;
      this.drain();
    }
  }

  private drain(): void {
    while (this.activeCount < this.maxConcurrent) {
      const item = this.queue.shift();
      if (!item) return;
      clearTimeout(item.timeout);
      item.sourceSignal.removeEventListener("abort", item.onAbort);
      this.activeCount += 1;
      void item.task(item.controller.signal)
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.drain();
        });
    }
  }

  private removeQueuedItem(target: QueueItem): void {
    const index = this.queue.indexOf(target);
    if (index >= 0) this.queue.splice(index, 1);
  }
}
