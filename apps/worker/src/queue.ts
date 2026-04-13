import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env.js";
import { log } from "./log.js";
import { runCatalogRefresh } from "./scraper/catalog.js";
import { runSnapshotAll, pruneOldSnapshots } from "./scraper/snapshot.js";
import { runHistoryBackfill } from "./scraper/history.js";
import {
  runOrderbookAll,
  pruneOldOrderbooks,
} from "./scraper/orderbook.js";
import { runSboxGameRefresh } from "./scraper/sboxGame.js";
import { runAlertsCheck } from "./jobs/alerts.js";

export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export const QUEUE = "sbox";

export const queue = new Queue(QUEUE, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
    attempts: 2,
  },
});

export async function scheduleRepeatable() {
  // Clear any previous repeatables to avoid duplicates after redeploys.
  const prev = await queue.getRepeatableJobs();
  for (const j of prev) await queue.removeRepeatableByKey(j.key);

  // Catalog rarely changes; every 6h is plenty (~80 items total today).
  await queue.add(
    "catalog",
    {},
    { repeat: { pattern: "0 */6 * * *" }, jobId: "catalog" }
  );
  // Snapshot every 10 min — 78 items × 5s = ~6.5 min per cycle.
  await queue.add(
    "snapshot",
    {},
    { repeat: { pattern: "*/10 * * * *" }, jobId: "snapshot" }
  );
  // history backfill is opt-in (requires steamLoginSecure cookie). It is
  // triggered manually from the UI / CLI, not on a cron.
  // Orderbook every 30 min — adds liquidity / spread metrics.
  await queue.add(
    "orderbook",
    {},
    { repeat: { pattern: "*/30 * * * *" }, jobId: "orderbook" }
  );
  // sbox.game metrics scrape — lifetime/30d/7d/1d revenue + units sold.
  // Runs hourly; the page itself only updates every ~hour on Facepunch's
  // side so more frequent probes would be wasted Chromium launches.
  await queue.add(
    "sboxgame",
    {},
    { repeat: { pattern: "17 * * * *" }, jobId: "sboxgame" }
  );
  await queue.add(
    "prune",
    {},
    { repeat: { pattern: "30 4 * * *" }, jobId: "prune" }
  );
  log.info("repeatable jobs scheduled");
}

export function startWorker() {
  const w = new Worker(
    QUEUE,
    async (job) => {
      switch (job.name) {
        case "catalog":
          return runCatalogRefresh();
        case "snapshot": {
          const res = await runSnapshotAll();
          await runAlertsCheck();
          return res;
        }
        case "history":
          return runHistoryBackfill();
        case "orderbook":
          return runOrderbookAll();
        case "sboxgame":
          return runSboxGameRefresh();
        case "prune": {
          const a = await pruneOldSnapshots();
          const b = await pruneOldOrderbooks();
          return { snapshots: a, orderbooks: b };
        }
        default:
          throw new Error(`unknown job ${job.name}`);
      }
    },
    { connection, concurrency: 1 }
  );

  // Only noisy events we care about — skip `completed`.
  w.on("failed", (job, err) =>
    log.error({ job: job?.name, err: err.message }, "job failed")
  );
  w.on("stalled", (jobId) => log.warn({ jobId }, "job stalled"));

  const events = new QueueEvents(QUEUE, { connection });
  events.on("error", (err) => log.error({ err: err.message }, "queue events error"));
  return w;
}
