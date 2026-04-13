import type { CommandContext, Context } from "grammy";
import { prisma } from "@sbox/db";
import { compact, getCurrency } from "../lib/format.js";
import { backButton } from "../lib/keyboard.js";

export async function statsHandler(ctx: CommandContext<Context>) {
  const cap = (await prisma.$queryRawUnsafe(`
    WITH latest AS (
      SELECT DISTINCT ON ("itemId") "itemId", "medianPrice" FROM "PriceSnapshot" ORDER BY "itemId", "ts" DESC
    )
    SELECT COALESCE(SUM(s.units * l."medianPrice"),0)::float AS cap,
           COALESCE(SUM(s.units),0)::int AS stock
    FROM "SboxGameStat" s
    JOIN latest l ON l."itemId" = s."itemId"
    WHERE s.timeframe = 'all' AND l."medianPrice" IS NOT NULL
  `)) as Array<{ cap: number; stock: number }>;

  const vol = (await prisma.$queryRawUnsafe(`
    WITH latest AS (
      SELECT DISTINCT ON ("itemId") "itemId", "medianPrice", "volume24h"
      FROM "PriceSnapshot" ORDER BY "itemId", "ts" DESC
    )
    SELECT COALESCE(SUM("medianPrice" * "volume24h"),0)::float AS vol_usd,
           COALESCE(SUM("volume24h"),0)::int AS sales,
           COUNT(*)::int AS items
    FROM latest WHERE "medianPrice" IS NOT NULL
  `)) as Array<{ vol_usd: number; sales: number; items: number }>;

  const sbox = (await prisma.$queryRawUnsafe(`
    SELECT timeframe, SUM("usdRevenue")::float AS rev, SUM(units)::int AS units
    FROM "SboxGameStat" GROUP BY timeframe
  `)) as Array<{ timeframe: string; rev: number; units: number }>;
  const byTf = Object.fromEntries(sbox.map((r) => [r.timeframe, r]));

  const cur = await getCurrency();
  const ca = cap[0];
  const v = vol[0];

  const text =
    `📊 *s\\&box Market Stats* \\(${esc(cur.code)}\\)\n\n` +
    `Market Cap: *${esc(compact(ca.cap, cur))}*\n` +
    `Total Stock: ${esc(ca.stock.toLocaleString())} units\n` +
    `Volume 24h: ${esc(compact(v.vol_usd, cur))} \\(${esc(String(v.sales))} sales\\)\n` +
    `Items: ${v.items}\n\n` +
    `*sbox\\.game revenue*\n` +
    `Lifetime: ${esc(compact(byTf.all?.rev ?? 0, cur))} \\(${esc(String(byTf.all?.units ?? 0))}u\\)\n` +
    `30d: ${esc(compact(byTf["30d"]?.rev ?? 0, cur))} \\| 7d: ${esc(compact(byTf["7d"]?.rev ?? 0, cur))} \\| 1d: ${esc(compact(byTf["1d"]?.rev ?? 0, cur))}`;

  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: backButton() });
}

function esc(s: string) {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
