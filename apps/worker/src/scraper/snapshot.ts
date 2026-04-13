import { prisma } from "@sbox/db";
import { env } from "../env.js";
import { log } from "../log.js";
import { steamGet } from "./http.js";

interface PriceOverview {
  success: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

// Parses strings like "$1.23" / "1,23€" into a float (USD assumed).
function parsePrice(s?: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function runSnapshotAll(): Promise<{ items: number }> {
  const run = await prisma.scrapeRun.create({ data: { kind: "snapshot" } });
  const started = Date.now();
  let processed = 0;
  try {
    const items = await prisma.item.findMany({
      select: { id: true, marketHashName: true },
    });
    const rows: Array<{
      itemId: number;
      lowestPrice: number | null;
      medianPrice: number | null;
      volume24h: number | null;
    }> = [];

    for (const it of items) {
      const url =
        `https://steamcommunity.com/market/priceoverview/` +
        `?appid=${env.appId}&currency=${env.currency}` +
        `&market_hash_name=${encodeURIComponent(it.marketHashName)}`;
      try {
        const data = await steamGet<PriceOverview>({ url });
        if (!data.success) continue;
        rows.push({
          itemId: it.id,
          lowestPrice: parsePrice(data.lowest_price),
          medianPrice: parsePrice(data.median_price),
          volume24h: data.volume ? Number(data.volume.replace(/[^0-9]/g, "")) : null,
        });
        processed++;
      } catch {
        // Single-item failure shouldn't kill the whole job.
        continue;
      }

      // Flush in batches of 50 to keep heap flat.
      if (rows.length >= 50) {
        await prisma.priceSnapshot.createMany({ data: rows });
        rows.length = 0;
      }
    }
    if (rows.length) await prisma.priceSnapshot.createMany({ data: rows });

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, itemsProcessed: processed },
    });
    log.info(
      { items: processed, duration: Date.now() - started },
      "snapshotAll ok"
    );
    return { items: processed };
  } catch (err) {
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        itemsProcessed: processed,
      },
    });
    log.error({ err }, "snapshotAll fail");
    throw err;
  }
}

// Drop intraday rows older than 7 days — the daily history table is
// authoritative past that horizon.
export async function pruneOldSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const res = await prisma.priceSnapshot.deleteMany({
    where: { ts: { lt: cutoff } },
  });
  log.info({ deleted: res.count }, "snapshot prune ok");
  return res.count;
}
