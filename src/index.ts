import { createIntentAgentFactory } from "./agent/intent-agent.js";
import { createHttpServer } from "./infrastructure/http-server.js";
import { loadConfig } from "./infrastructure/config.js";
import { logger } from "./infrastructure/logger.js";
import { installGracefulShutdown } from "./infrastructure/shutdown.js";
import { createIntentService } from "./services/intent-service.js";

const config = loadConfig();
const intentService = createIntentService(createIntentAgentFactory(config), config.modelTimeoutMs);
let inFlight = 0;
const server = createHttpServer({
  config,
  intentService,
  logger,
  onRequestStart: () => { inFlight += 1; },
  onRequestFinish: () => { inFlight = Math.max(0, inFlight - 1); },
});

server.listen(config.port, config.host, () => {
  logger.info("intent planner listening", { host: config.host, port: config.port });
});

installGracefulShutdown(server, config.shutdownGraceMs, () => inFlight, logger);
