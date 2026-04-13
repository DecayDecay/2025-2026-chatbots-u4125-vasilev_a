export const env = {
  appId: process.env.STEAM_APPID ?? "590830",
  currency: process.env.STEAM_CURRENCY ?? "1",
  loginSecure: process.env.STEAM_LOGIN_SECURE ?? "",
  reqPerMin: Number(process.env.SCRAPER_REQ_PER_MIN ?? 12),
  concurrency: Number(process.env.SCRAPER_CONCURRENCY ?? 1),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  logLevel: process.env.LOG_LEVEL ?? "info",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
