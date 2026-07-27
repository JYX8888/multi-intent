import type { Server } from "node:http";
import type { Logger } from "./logger.js";

export function installGracefulShutdown(
  server: Server,
  graceMs: number,
  getInFlight: () => number,
  logger: Logger,
  onShutdownStart?: () => void,
): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    onShutdownStart?.();
    logger.info("shutdown started", { signal });
    server.close(() => {
      logger.info("shutdown completed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("shutdown grace period exceeded", { inFlight: getInFlight() });
      process.exit(1);
    }, graceMs).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
