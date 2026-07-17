import { createServer, type Server } from "node:http";
import { handleRequest, type RouteDependencies } from "../api/routes.js";

export function createHttpServer(dependencies: RouteDependencies): Server {
  return createServer((request, response) => {
    dependencies.onRequestStart?.();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dependencies.onRequestFinish?.();
    };
    response.once("finish", finish);
    response.once("close", finish);
    void handleRequest(request, response, dependencies);
  });
}
