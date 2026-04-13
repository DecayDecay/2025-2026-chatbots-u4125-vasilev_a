import { prisma } from "@sbox/db";

// Steam icon URLs are relative; this CDN host is the canonical one.
const STEAM_CDN = "https://community.akamai.steamstatic.com/economy/image/";
export function iconSrc(iconUrl: string | null, size = 96) {
  if (!iconUrl) return null;
  return `${STEAM_CDN}${iconUrl}/${size}fx${size}f`;
}

// Latest snapshot per item + 24h-ago snapshot for delta.
// One CTE-style query keeps it cheap regardless of catalog size.
export async function getMarketRows(opts: {
  search?: string;
  type?: string;
  minVolume?: number;
  minPrice?: number;
  maxPrice?: number;
  minStock?: number;
  maxStock?: number;
  deals?: boolean;
  watchOnly?: boolean;
  sort?:
    | "name"
    | "price"
    | "volume"
    | "delta"
    | "drawdown"
    | "deal"
    | "cap"
    | "volusd"
    | "stock"
    | "rare"
    | "lifetime"
    | "momentum"
    | "truecap";
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (opts.search) where.name = { contains: opts.search, mode: "insensitive" };
  if (opts.type) where.type = opts.type;
  if (opts.watchOnly) where.watchlist = { some: {} };

  const items = await prisma.item.findMany({
    where,
    take: opts.limit ?? 500,
    skip: opts.offset ?? 0,
    orderBy: { name: "asc" },
    select: {
      id: true,
      marketHashName: true,
      name: true,
      iconUrl: true,
      type: true,
      tags: true,
    },
  });
  if (!items.length) return [];

  const ids = items.map((i) => i.id);

  // Latest snapshot per item — but sellListings is only written by the
  // catalog job, so we also pick up the freshest non-null listings count
  // so market cap stays computable.
  const latest = (await prisma.$queryRawUnsafe(
    `
    WITH latest_any AS (
      SELECT DISTINCT ON ("itemId")
        "itemId", "lowestPrice", "medianPrice", "volume24h", "sellListings", "ts"
      FROM "PriceSnapshot"
      WHERE "itemId" = ANY($1::int[])
      ORDER BY "itemId", "ts" DESC
    ),
    listings AS (
      SELECT DISTINCT ON ("itemId") "itemId", "sellListings"
      FROM "PriceSnapshot"
      WHERE "itemId" = ANY($1::int[]) AND "sellListings" IS NOT NULL
      ORDER BY "itemId", "ts" DESC
    )
    SELECT la."itemId", la."lowestPrice", la."medianPrice",
           la."volume24h",
           COALESCE(la."sellListings", l."sellListings") AS "sellListings",
           la."ts"
    FROM latest_any la
    LEFT JOIN listings l ON l."itemId" = la."itemId"
    `,
    ids
  )) as Array<{
    itemId: number;
    lowestPrice: unknown;
    medianPrice: unknown;
    volume24h: number | null;
    sellListings: number | null;
    ts: Date;
  }>;
  const latestMap = new Map(latest.map((s) => [s.itemId, s]));

  // Snapshot closest to ~24h ago, used as the baseline for Δ24h.
  // We only consider rows that have a `medianPrice` so we always compare
  // apples to apples (catalog-only snapshots that lack median are ignored).
  // If nothing is older than 24h yet, we fall back to the *second-most-recent*
  // qualifying snapshot — that way the dashboard shows a real Δ from
  // intraday data within the first day, but never compares lowest vs median.
  const prior = (await prisma.$queryRawUnsafe(
    `
    WITH ranked AS (
      SELECT
        "itemId",
        "lowestPrice",
        "medianPrice",
        "ts",
        ROW_NUMBER() OVER (
          PARTITION BY "itemId"
          ORDER BY
            CASE WHEN "ts" <= NOW() - INTERVAL '24 hours' THEN 0 ELSE 1 END,
            CASE WHEN "ts" <= NOW() - INTERVAL '24 hours' THEN -EXTRACT(EPOCH FROM "ts") ELSE EXTRACT(EPOCH FROM "ts") END
        ) AS rn,
        ROW_NUMBER() OVER (
          PARTITION BY "itemId" ORDER BY "ts" DESC
        ) AS recency
      FROM "PriceSnapshot"
      WHERE "itemId" = ANY($1::int[])
        AND "medianPrice" IS NOT NULL
    )
    SELECT "itemId", "lowestPrice", "medianPrice", "ts"
    FROM ranked
    WHERE rn = 1 AND recency > 1
    `,
    ids
  )) as Array<{
    itemId: number;
    lowestPrice: unknown;
    medianPrice: unknown;
    ts: Date;
  }>;
  const priorMap = new Map(prior.map((s) => [s.itemId, s]));

  // 30-day sparkline from PriceHistory (cheap, already daily).
  const hist = (await prisma.$queryRawUnsafe(
    `
    SELECT "itemId", "day", "price"
    FROM "PriceHistory"
    WHERE "itemId" = ANY($1::int[])
      AND "day" >= (CURRENT_DATE - INTERVAL '30 days')
    ORDER BY "itemId", "day" ASC
    `,
    ids
  )) as Array<{ itemId: number; day: Date; price: unknown }>;
  const sparkMap = new Map<number, number[]>();
  for (const h of hist) {
    const arr = sparkMap.get(h.itemId) ?? [];
    arr.push(Number(h.price));
    sparkMap.set(h.itemId, arr);
  }

  // Per-item sbox.game stats (lifetime + 30d + 7d + 1d).
  // One query, pivoted in JS.
  const sbox = (await prisma.$queryRawUnsafe(
    `SELECT "itemId", "timeframe", "usdRevenue", "units"
     FROM "SboxGameStat"
     WHERE "itemId" = ANY($1::int[])`,
    ids
  )) as Array<{
    itemId: number;
    timeframe: string;
    usdRevenue: unknown;
    units: number;
  }>;
  type SboxBucket = { usd: number; units: number };
  const sboxMap = new Map<
    number,
    { all?: SboxBucket; "30d"?: SboxBucket; "7d"?: SboxBucket; "1d"?: SboxBucket }
  >();
  for (const s of sbox) {
    const bucket: SboxBucket = {
      usd: Number(s.usdRevenue) || 0,
      units: s.units,
    };
    const prev = sboxMap.get(s.itemId) ?? {};
    (prev as Record<string, SboxBucket>)[s.timeframe] = bucket;
    sboxMap.set(s.itemId, prev);
  }

  // ATH per item, computed from all snapshots we have. This becomes the
  // baseline for the "drawdown from ATH" investor metric. Once PriceHistory
  // is populated (cookie backfill) it will widen the window automatically.
  const aths = (await prisma.$queryRawUnsafe(
    `
    SELECT "itemId", MAX(GREATEST(
      COALESCE("medianPrice", 0),
      COALESCE("lowestPrice", 0)
    )) AS ath
    FROM "PriceSnapshot"
    WHERE "itemId" = ANY($1::int[])
    GROUP BY "itemId"
    `,
    ids
  )) as Array<{ itemId: number; ath: unknown }>;
  const athMap = new Map(aths.map((a) => [a.itemId, Number(a.ath) || null]));

  let rows = items.map((it) => {
    const s = latestMap.get(it.id);
    const p = priorMap.get(it.id);
    const cur = s ? Number(s.medianPrice ?? s.lowestPrice ?? 0) || null : null;
    const old = p ? Number(p.medianPrice ?? p.lowestPrice ?? 0) || null : null;
    const change24h = cur != null && old != null && old > 0 ? (cur - old) / old : null;
    const ath = athMap.get(it.id) ?? null;
    const drawdown =
      ath && cur != null && ath > 0 ? (cur - ath) / ath : null;
    // Sniping deal: lowest sell price meaningfully below median right now.
    const lowest = s ? Number(s.lowestPrice ?? 0) || null : null;
    const median = s ? Number(s.medianPrice ?? 0) || null : null;
    const dealDiscount =
      lowest != null && median != null && median > 0
        ? (lowest - median) / median
        : null;
    const spark = sparkMap.get(it.id) ?? [];
    // Steam item meta sometimes provides a hex background color (rarity).
    const meta = (it as unknown as { tags?: { backgroundColor?: string; nameColor?: string } }).tags;
    const bg = meta?.backgroundColor ? `#${meta.backgroundColor}` : null;
    const fg = meta?.nameColor ? `#${meta.nameColor}` : null;

    // sbox.game lifetime + timeframe stats. Real stock = total units
    // traded ever. Real cap = avg lifetime sale × units. Momentum = how
    // much of lifetime revenue happened in the last 30 days.
    const sb = sboxMap.get(it.id);
    const stock = sb?.all?.units ?? null;
    const lifetimeRev = sb?.all?.usd ?? null;
    const avgSalePrice =
      lifetimeRev != null && stock != null && stock > 0
        ? lifetimeRev / stock
        : null;
    const trueCap =
      avgSalePrice != null && stock != null ? avgSalePrice * stock : null;
    const rev30d = sb?.["30d"]?.usd ?? null;
    const rev7d = sb?.["7d"]?.usd ?? null;
    const rev1d = sb?.["1d"]?.usd ?? null;
    const units30d = sb?.["30d"]?.units ?? null;
    const momentum30d =
      lifetimeRev != null && lifetimeRev > 0 && rev30d != null
        ? rev30d / lifetimeRev
        : null;
    return {
      id: it.id,
      marketHashName: it.marketHashName,
      name: it.name,
      type: it.type,
      icon: iconSrc(it.iconUrl, 96),
      rarityBg: bg,
      rarityFg: fg,
      lowestPrice: lowest,
      medianPrice: median,
      sales24h: s?.volume24h ?? null,
      sellListings: s?.sellListings ?? null,
      listedValue:
        median != null && s?.sellListings != null
          ? median * s.sellListings
          : null,
      volumeUsd24h:
        median != null && s?.volume24h != null ? median * s.volume24h : null,
      // sbox.game real supply/cap fields
      stock,
      lifetimeRev,
      avgSalePrice,
      trueCap,
      rev30d,
      rev7d,
      rev1d,
      units30d,
      momentum30d,
      change24h,
      drawdown,
      dealDiscount,
      ath,
      sparkline: spark,
    };
  });

  // Filters that need computed values.
  if (opts.minPrice != null)
    rows = rows.filter(
      (r) => r.medianPrice != null && r.medianPrice >= opts.minPrice!
    );
  if (opts.maxPrice != null)
    rows = rows.filter(
      (r) => r.medianPrice != null && r.medianPrice <= opts.maxPrice!
    );
  if (opts.minVolume != null)
    rows = rows.filter((r) => (r.sales24h ?? 0) >= opts.minVolume!);
  if (opts.deals)
    rows = rows.filter((r) => (r.dealDiscount ?? 0) <= -0.05);
  if (opts.minStock != null)
    rows = rows.filter((r) => (r.stock ?? 0) >= opts.minStock!);
  if (opts.maxStock != null)
    rows = rows.filter(
      (r) => r.stock != null && r.stock <= opts.maxStock!
    );

  // Sorting.
  switch (opts.sort) {
    case "price":
      rows.sort((a, b) => (b.medianPrice ?? 0) - (a.medianPrice ?? 0));
      break;
    case "volume":
      rows.sort((a, b) => (b.sales24h ?? 0) - (a.sales24h ?? 0));
      break;
    case "delta":
      rows.sort((a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity));
      break;
    case "drawdown":
      rows.sort((a, b) => (a.drawdown ?? 0) - (b.drawdown ?? 0));
      break;
    case "deal":
      rows.sort((a, b) => (a.dealDiscount ?? 0) - (b.dealDiscount ?? 0));
      break;
    case "cap":
      rows.sort((a, b) => (b.listedValue ?? 0) - (a.listedValue ?? 0));
      break;
    case "volusd":
      rows.sort((a, b) => (b.volumeUsd24h ?? 0) - (a.volumeUsd24h ?? 0));
      break;
    case "stock":
      rows.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));
      break;
    case "rare":
      rows.sort(
        (a, b) => (a.stock ?? Infinity) - (b.stock ?? Infinity)
      );
      break;
    case "lifetime":
      rows.sort((a, b) => (b.lifetimeRev ?? 0) - (a.lifetimeRev ?? 0));
      break;
    case "truecap":
      rows.sort((a, b) => (b.trueCap ?? 0) - (a.trueCap ?? 0));
      break;
    case "momentum":
      rows.sort((a, b) => (b.momentum30d ?? 0) - (a.momentum30d ?? 0));
      break;
    default:
      // already alphabetical
      break;
  }
  return rows;
}

// Top-level aggregate across all tracked items from sbox.game stats.
// Returns lifetime revenue + units + 30d + top earners — powers the
// dashboard "Facepunch metrics" strip.
export async function getSboxGameOverview() {
  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH all_stats AS (
      SELECT i.id, i.name, i."marketHashName", i."iconUrl",
             s.timeframe, s."usdRevenue", s.units
      FROM "SboxGameStat" s
      JOIN "Item" i ON i.id = s."itemId"
    )
    SELECT timeframe, SUM("usdRevenue")::numeric AS rev, SUM(units)::int AS units
    FROM all_stats
    GROUP BY timeframe
    `
  )) as Array<{ timeframe: string; rev: unknown; units: number }>;
  const byTf = new Map(
    rows.map((r) => [r.timeframe, { rev: Number(r.rev), units: r.units }])
  );

  const top = (await prisma.$queryRawUnsafe(
    `
    SELECT i.id, i.name, i."marketHashName", i."iconUrl",
           s."usdRevenue", s.units
    FROM "SboxGameStat" s
    JOIN "Item" i ON i.id = s."itemId"
    WHERE s.timeframe = 'all'
    ORDER BY s."usdRevenue" DESC
    LIMIT 6
    `
  )) as Array<{
    id: number;
    name: string;
    marketHashName: string;
    iconUrl: string | null;
    usdRevenue: unknown;
    units: number;
  }>;

  return {
    all: byTf.get("all") ?? { rev: 0, units: 0 },
    d30: byTf.get("30d") ?? { rev: 0, units: 0 },
    d7: byTf.get("7d") ?? { rev: 0, units: 0 },
    d1: byTf.get("1d") ?? { rev: 0, units: 0 },
    topEarners: top.map((t) => ({
      id: t.id,
      name: t.name,
      marketHashName: t.marketHashName,
      icon: iconSrc(t.iconUrl, 96),
      lifetimeRev: Number(t.usdRevenue),
      stock: t.units,
    })),
  };
}

export async function getWatchlistIds(): Promise<number[]> {
  const rows = await prisma.watchlist.findMany({ select: { itemId: true } });
  return rows.map((r) => r.itemId);
}

// Aggregate stats across the whole catalog — drives the "market overview"
// banner on the dashboard. Single SQL roundtrip.
export async function getMarketOverview() {
  const row = (await prisma.$queryRawUnsafe(
    `
    WITH latest AS (
      SELECT DISTINCT ON ("itemId")
        "itemId", "lowestPrice", "medianPrice", "volume24h", "ts"
      FROM "PriceSnapshot"
      ORDER BY "itemId", "ts" DESC
    ),
    listings AS (
      SELECT DISTINCT ON ("itemId") "itemId", "sellListings"
      FROM "PriceSnapshot"
      WHERE "sellListings" IS NOT NULL
      ORDER BY "itemId", "ts" DESC
    ),
    joined AS (
      SELECT la.*, l."sellListings"
      FROM latest la
      LEFT JOIN listings l ON l."itemId" = la."itemId"
    )
    SELECT
      (SELECT count(*) FROM "Item")::int AS item_count,
      COALESCE(SUM("medianPrice" * "volume24h"), 0)    AS volume_usd_24h,
      COALESCE(SUM("volume24h"), 0)::int               AS sales_24h,
      MAX("ts") AS last_ts
    FROM joined
    WHERE "medianPrice" IS NOT NULL
    `
  )) as Array<{
    item_count: number;
    volume_usd_24h: unknown;
    sales_24h: number;
    last_ts: Date | null;
  }>;

  // True market cap = Σ (sbox.game lifetime units × current Steam median).
  // This is the real circulating supply from Facepunch × latest market price.
  const capRows = (await prisma.$queryRawUnsafe(
    `
    WITH latest AS (
      SELECT DISTINCT ON ("itemId") "itemId", "medianPrice"
      FROM "PriceSnapshot"
      ORDER BY "itemId", "ts" DESC
    )
    SELECT COALESCE(SUM(s.units * l."medianPrice"), 0) AS market_cap
    FROM "SboxGameStat" s
    JOIN latest l ON l."itemId" = s."itemId"
    WHERE s.timeframe = 'all' AND l."medianPrice" IS NOT NULL
    `
  )) as Array<{ market_cap: unknown }>;

  const r = row[0];
  return {
    itemCount: r.item_count,
    marketCap: Number(capRows[0]?.market_cap ?? 0),
    volumeUsd24h: Number(r.volume_usd_24h),
    sales24h: r.sales_24h,
    lastTs: r.last_ts,
  };
}

// Similar items recommender — same type, closest price, optionally
// excluding the item itself. Used on the detail page.
export async function getSimilarItems(itemId: number, type: string | null) {
  if (!type) return [];
  const pivot = await prisma.priceSnapshot.findFirst({
    where: { itemId },
    orderBy: { ts: "desc" },
    select: { medianPrice: true, lowestPrice: true },
  });
  const pivotPrice = Number(pivot?.medianPrice ?? pivot?.lowestPrice ?? 0) || 0;
  if (!pivotPrice) return [];

  const rows = (await prisma.$queryRawUnsafe(
    `
    WITH latest AS (
      SELECT DISTINCT ON (ps."itemId")
        ps."itemId", ps."medianPrice", ps."lowestPrice"
      FROM "PriceSnapshot" ps
      JOIN "Item" i ON i.id = ps."itemId"
      WHERE i.type = $1 AND i.id <> $2
      ORDER BY ps."itemId", ps."ts" DESC
    )
    SELECT i.id, i.name, i."marketHashName", i."iconUrl",
           l."medianPrice", l."lowestPrice"
    FROM latest l
    JOIN "Item" i ON i.id = l."itemId"
    WHERE l."medianPrice" IS NOT NULL
    ORDER BY ABS(l."medianPrice" - $3) ASC
    LIMIT 6
    `,
    type,
    itemId,
    pivotPrice
  )) as Array<{
    id: number;
    name: string;
    marketHashName: string;
    iconUrl: string | null;
    medianPrice: unknown;
    lowestPrice: unknown;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    marketHashName: r.marketHashName,
    icon: iconSrc(r.iconUrl, 96),
    price: Number(r.medianPrice ?? r.lowestPrice ?? 0) || 0,
  }));
}

export async function getDistinctTypes(): Promise<string[]> {
  const rows = await prisma.item.findMany({
    where: { type: { not: null } },
    select: { type: true },
    distinct: ["type"],
    orderBy: { type: "asc" },
  });
  return rows.map((r) => r.type!).filter(Boolean);
}

export async function getItemDetail(hash: string) {
  const item = await prisma.item.findUnique({
    where: { marketHashName: hash },
  });
  if (!item) return null;
  const history = await prisma.priceHistory.findMany({
    where: { itemId: item.id },
    orderBy: { day: "asc" },
    select: { day: true, price: true, volume: true },
  });
  // Snapshots series — used when PriceHistory is empty (anonymous mode).
  const snaps = await prisma.priceSnapshot.findMany({
    where: { itemId: item.id },
    orderBy: { ts: "asc" },
    select: { ts: true, lowestPrice: true, medianPrice: true, volume24h: true },
  });
  const latest = snaps[snaps.length - 1] ?? null;
  const orderbook = await prisma.orderBook.findFirst({
    where: { itemId: item.id },
    orderBy: { ts: "desc" },
  });
  return {
    item: { ...item, icon: iconSrc(item.iconUrl, 256) },
    latest,
    orderbook,
    history: history.map((h) => ({
      day: h.day.toISOString().slice(0, 10),
      price: Number(h.price),
      volume: h.volume,
    })),
    snapshots: snaps.map((s) => ({
      ts: s.ts.toISOString(),
      price: Number(s.medianPrice ?? s.lowestPrice ?? 0) || null,
      volume: s.volume24h,
    })),
  };
}
