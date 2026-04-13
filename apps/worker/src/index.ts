import { log } from "./log.js";
import { scheduleRepeatable, startWorker } from "./queue.js";

async function main() {
  await scheduleRepeatable();
  startWorker();
  log.info("worker started");
}

main().catch((err) => {
  log.error({ err }, "worker bootstrap failed");
  process.exit(1);
});
