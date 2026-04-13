import { prisma } from "@sbox/db";
import { env } from "../env.js";
import { log } from "../log.js";
import { steamGet } from "./http.js";

interface SearchResponse {
  success: boolean;
  total_count: number;
  results: Array<{
    name: string;
    hash_name: string;
    sell_listings?: number;
    sell_price?: number; // cents
    sale_price_text?: string;
    asset_description?: {
      icon_url?: string;
      type?: string;
      market_name?: string;
      name_color?: string;
      background_color?: string;
    };
  }>;
}

// Steam clamps `count` to 10 for the search/render endpoint regardless of
// what we ask for. Hard-coding it avoids confusion in the loop logic.
const PAGE = 10;

export async function runCatalogRefresh(): Promise<{ items: number }> {
  const run = await prisma.scrapeRun.create({ data: { kind: "catalog" } });
  const started = Date.now();
  let processed = 0;
  try {
    let start = 0;
    let total = Infinity;
    while (start < total) {
      const url =
        `https://steamcommunity.com/market/search/render/` +
        `?query=&start=${start}&count=${PAGE}` +
        `&search_descriptions=0&sort_column=popular&sort_dir=desc` +
        `&appid=${env.appId}&norender=1&cc=US&l=english`;
      const data = await steamGet<SearchResponse>({ url });
      if (!data.success) throw new Error("search not success");
      total = data.total_count;

      // Batch upsert per page. Prisma has no bulk upsert, so use a transaction.
      await prisma.$transaction(
        data.results.map((r) => {
          const meta = {
            sellListings: r.sell_listings ?? null,
            sellPriceCents: r.sell_price ?? null,
            nameColor: r.asset_description?.name_color ?? null,
            backgroundColor: r.asset_description?.background_color ?? null,
          };
          return prisma.item.upsert({
            where: { marketHashName: r.hash_name },
            create: {
              marketHashName: r.hash_name,
              name: r.name,
              iconUrl: r.asset_description?.icon_url ?? null,
              type: r.asset_description?.type ?? null,
              tags: meta,
              lastScrapedAt: new Date(),
            },
            update: {
              name: r.name,
              iconUrl: r.asset_description?.icon_url ?? null,
              type: r.asset_description?.type ?? null,
              tags: meta,
              lastScrapedAt: new Date(),
            },
          });
        })
      );

      // Free snapshot: catalog already includes lowest sell price + listings.
      // We persist them so the dashboard has fresh data immediately, even
      // before the dedicated snapshot job runs.
      const itemsForSnapshot = await prisma.item.findMany({
        where: { marketHashName: { in: data.results.map((r) => r.hash_name) } },
        select: { id: true, marketHashName: true },
      });
      const idByHash = new Map(
        itemsForSnapshot.map((i) => [i.marketHashName, i.id])
      );
      const snapRows = data.results
        .map((r) => {
          const id = idByHash.get(r.hash_name);
          if (!id) return null;
          return {
            itemId: id,
            lowestPrice:
              r.sell_price != null ? r.sell_price / 100 : null,
            medianPrice: null,
            volume24h: null,
            sellListings: r.sell_listings ?? null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (snapRows.length) {
        await prisma.priceSnapshot.createMany({ data: snapRows });
      }

      processed += data.results.length;
      start += PAGE;
      if (data.results.length === 0) break;
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, itemsProcessed: processed },
    });
    log.info(
      { items: processed, duration: Date.now() - started },
      "catalogRefresh ok"
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
    log.error({ err }, "catalogRefresh fail");
    throw err;
  }
}
