import { prisma } from "@sbox/db";
import { request } from "undici";
import { env } from "../env.js";
import { log } from "../log.js";
import { steamGet } from "./http.js";

// itemordershistogram returns base64-html chunks for buy/sell tables and a
// `highest_buy_order` / `lowest_sell_order` price in millicents.
interface HistogramResponse {
  success: number;
  highest_buy_order?: string;
  lowest_sell_order?: string;
  buy_order_graph?: Array<[number, number, string]>; // [price, qty_cumulative, label]
  sell_order_graph?: Array<[number, number, string]>;
}

// Item nameid is the integer Steam uses for histogram lookups.
// It only lives inside the listing HTML page (not in JSON), so we scrape it
// once per item and cache in the Item row.
export async function resolveNameId(
  itemId: number,
  marketHashName: string
): Promise<string | null> {
  const url = `https://steamcommunity.com/market/listings/${env.appId}/${encodeURIComponent(
    marketHashName
  )}`;
  // Use undici directly — this returns HTML, not JSON, so steamGet doesn't fit.
  const res = await request(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) sbox-terminal/0.1",
      accept: "text/html",
    },
  });
  if (res.statusCode !== 200) {
    await res.body.dump();
    return null;
  }
  const html = await res.body.text();
  const m = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
  const nameId = m?.[1] ?? null;
  if (nameId) {
    await prisma.item.update({
      where: { id: itemId },
      data: { nameId, nameIdResolvedAt: new Date() },
    });
  }
  return nameId;
}

function cumulativeToLevels(graph?: Array<[number, number, string]>) {
  if (!graph?.length) return [] as Array<[number, number]>;
  const levels: Array<[number, number]> = [];
  let prevQty = 0;
  for (const [price, cumQty] of graph) {
    const qty = cumQty - prevQty;
    prevQty = cumQty;
    if (qty > 0) levels.push([price, qty]);
  }
  return levels.slice(0, 20);
}

function totalUsd(levels: Array<[number, number]>) {
  return levels.reduce((acc, [p, q]) => acc + p * q, 0);
}

export async function runOrderbookAll(opts?: { limit?: number }) {
  const run = await prisma.scrapeRun.create({ data: { kind: "orderbook" } });
  const started = Date.now();
  let processed = 0;
  try {
    const items = await prisma.item.findMany({
      take: opts?.limit,
      select: {
        id: true,
        marketHashName: true,
        nameId: true,
      },
    });

    for (const it of items) {
      let nameId = it.nameId;
      if (!nameId) {
        try {
          nameId = await resolveNameId(it.id, it.marketHashName);
        } catch {
          continue;
        }
        if (!nameId) continue;
      }

      const url =
        `https://steamcommunity.com/market/itemordershistogram` +
        `?country=US&language=english&currency=${env.currency}&item_nameid=${nameId}&two_factor=0`;
      try {
        const data = await steamGet<HistogramResponse>({ url });
        if (!data.success) continue;
        const buyLevels = cumulativeToLevels(data.buy_order_graph);
        const sellLevels = cumulativeToLevels(data.sell_order_graph);
        const buyTop = buyLevels[0]?.[0] ?? null;
        const sellTop = sellLevels[0]?.[0] ?? null;
        const spreadPct =
          buyTop && sellTop ? ((sellTop - buyTop) / sellTop) * 100 : null;
        const buyTotal = totalUsd(buyLevels);
        const sellTotal = totalUsd(sellLevels);
        // Liquidity = how much $ you can move on the thinner side.
        const liquidity = Math.min(buyTotal, sellTotal);

        await prisma.orderBook.create({
          data: {
            itemId: it.id,
            buyTop,
            sellTop,
            spreadPct,
            buyTotalUsd: buyTotal,
            sellTotalUsd: sellTotal,
            liquidityScore: liquidity,
            buyWalls: buyLevels,
            sellWalls: sellLevels,
          },
        });
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
      "orderbookAll ok"
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
    log.error({ err }, "orderbookAll fail");
    throw err;
  }
}

export async function pruneOldOrderbooks(): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const res = await prisma.orderBook.deleteMany({
    where: { ts: { lt: cutoff } },
  });
  log.info({ deleted: res.count }, "orderbook prune ok");
  return res.count;
}
