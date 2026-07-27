import { createIntentAgentFactory } from "./agent/intent-agent.js";
import { createHttpServer } from "./infrastructure/http-server.js";
import { ConcurrencyLimiter } from "./infrastructure/concurrency-limiter.js";
import { loadConfig } from "./infrastructure/config.js";
import { loadEnvFileIfPresent } from "./infrastructure/env-file.js";
import { logger } from "./infrastructure/logger.js";
import { installGracefulShutdown } from "./infrastructure/shutdown.js";
import { createIntentService } from "./services/intent-service.js";

loadEnvFileIfPresent();
const config = loadConfig();
const limiter = new ConcurrencyLimiter(config.maxModelConcurrency, config.maxQueueSize, config.queueTimeoutMs);
const intentService = createIntentService(createIntentAgentFactory(config), config.modelTimeoutMs, limiter);
let inFlight = 0;
let draining = false;
const server = createHttpServer({
  config,
  intentService,
  logger,
  isDraining: () => draining,
  onRequestStart: () => { inFlight += 1; },
  onRequestFinish: () => { inFlight = Math.max(0, inFlight - 1); },
});

server.listen(config.port, config.host, () => {
  logger.info("intent planner listening", { host: config.host, port: config.port });
});

installGracefulShutdown(server, config.shutdownGraceMs, () => inFlight, logger, () => {
  draining = true;
});
