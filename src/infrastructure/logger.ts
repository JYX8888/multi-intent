export type Logger = {
  info(message: string, fields?: Record<string, string | number | boolean>): void;
  error(message: string, fields?: Record<string, string | number | boolean>): void;
};

export const logger: Logger = {
  info(message, fields) {
    console.log(JSON.stringify({ level: "info", message, ...fields }));
  },
  error(message, fields) {
    console.error(JSON.stringify({ level: "error", message, ...fields }));
  },
};
