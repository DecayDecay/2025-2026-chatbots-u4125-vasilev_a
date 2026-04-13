import pino from "pino";
import { env } from "./env.js";

// Minimal, production-friendly logger: no pretty transports, no query logs.
// One-line structured output -> stdout -> captured by docker json-file driver
// with rotation configured in docker-compose.yml.
export const log = pino({
  level: env.logLevel,
  base: undefined, // drop pid/hostname to shrink every line
  timestamp: pino.stdTimeFunctions.isoTime,
});
