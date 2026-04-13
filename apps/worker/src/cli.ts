import { log } from "./log.js";
import { runCatalogRefresh } from "./scraper/catalog.js";
import { runSnapshotAll, pruneOldSnapshots } from "./scraper/snapshot.js";
import { runHistoryBackfill } from "./scraper/history.js";
import { runOrderbookAll } from "./scraper/orderbook.js";
import { runAlertsCheck } from "./jobs/alerts.js";
import {
  probeSboxGameMetrics,
  runSboxGameRefresh,
} from "./scraper/sboxGame.js";

const cmd = process.argv[2];

async function main() {
  switch (cmd) {
    case "catalog":
      await runCatalogRefresh();
      break;
    case "snapshot":
      await runSnapshotAll();
      break;
    case "history":
      await runHistoryBackfill();
      break;
    case "orderbook":
      await runOrderbookAll();
      break;
    case "alerts": {
      const r = await runAlertsCheck();
      console.log("alerts", r);
      break;
    }
    case "sboxprobe": {
      const d = await probeSboxGameMetrics();
      console.log("SBOX_DUMP", JSON.stringify(d, null, 2));
      break;
    }
    case "sboxgame": {
      const r = await runSboxGameRefresh();
      console.log("sboxgame", r);
      break;
    }
    case "prune":
      await pruneOldSnapshots();
      break;
    default:
      console.log(
        "usage: cli.ts <catalog|snapshot|orderbook|history|prune>"
      );
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error({ err }, "cli failed");
    process.exit(1);
  });
