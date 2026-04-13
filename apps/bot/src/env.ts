import "dotenv/config";

export const env = {
  botToken: process.env.BOT_TOKEN ?? "",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://sbox:sbox@localhost:5432/sbox?schema=public",
  workerDir: process.env.WORKER_DIR ?? "../worker",
};

if (!env.botToken) {
  console.error("BOT_TOKEN is not set in .env");
  process.exit(1);
}
