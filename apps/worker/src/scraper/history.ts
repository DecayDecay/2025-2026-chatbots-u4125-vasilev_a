import { prisma } from "@sbox/db";
import { env } from "../env.js";
import { log } from "../log.js";
import { steamGet } from "./http.js";

interface PriceHistoryResponse {
  success: boolean;
  price_prefix?: string;
  prices?: Array<[string, number, string]>; // [date, price, volume]
}

// Steam format: "Sep 12 2024 01: +0"
function parseSteamDate(s: string): Date {
  // Trim hour suffix like " 01: +0" -> drop everything after day.
  const cleaned = s.replace(/\s\d+:\s*[+-]\d+$/, "");
  return new Date(cleaned + " UTC");
}

export async function runHistoryBackfill(opts?: { onlyItemId?: number }) {
  if (!env.loginSecure) {
    log.warn("historyBackfill skipped: STEAM_LOGIN_SECURE not set");
    return { items: 0 };
  }
  const run = await prisma.scrapeRun.create({ data: { kind: "history" } });
  const started = Date.now();
  let processed = 0;
  try {
    const items = await prisma.item.findMany({
      where: opts?.onlyItemId ? { id: opts.onlyItemId } : undefined,
      select: { id: true, marketHashName: true },
    });

    for (const it of items) {
      const url =
        `https://steamcommunity.com/market/pricehistory/` +
        `?appid=${env.appId}&currency=${env.currency}` +
        `&market_hash_name=${encodeURIComponent(it.marketHashName)}`;
      try {
        const data = await steamGet<PriceHistoryResponse>({
          url,
          withCookie: true,
        });
        if (!data.success || !data.prices?.length) continue;

        // Keep only daily rows — Steam returns hourly for the last month.
        // Group by YYYY-MM-DD and take the last price + summed volume.
        const byDay = new Map<string, { price: number; volume: number }>();
        for (const [date, price, volStr] of data.prices) {
          const d = parseSteamDate(date);
          const key = d.toISOString().slice(0, 10);
          const vol = Number(volStr) || 0;
          const prev = byDay.get(key);
          byDay.set(key, {
            price: price, // last writer wins (Steam rows are chronological)
            volume: (prev?.volume ?? 0) + vol,
          });
        }

        const rows = [...byDay.entries()].map(([k, v]) => ({
          itemId: it.id,
          day: new Date(k),
          price: v.price,
          volume: v.volume,
        }));

        // Upsert-like: delete existing then insert fresh for this item.
        await prisma.$transaction([
          prisma.priceHistory.deleteMany({ where: { itemId: it.id } }),
          prisma.priceHistory.createMany({ data: rows }),
        ]);
        processed++;
      } catch {
        continue;
      }
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, itemsProcessed: processed },
    });
    log.info(
      { items: processed, duration: Date.now() - started },
      "historyBackfill ok"
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
    log.error({ err }, "historyBackfill fail");
    throw err;
  }
}
