import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";
import { money, pct, esc, getCurrency } from "../lib/format.js";

const PAGE_SIZE = 8;

export async function marketHandler(ctx: CommandContext<Context>) {
  await sendMarketPage(ctx, 0);
}

export async function sendMarketPage(
  ctx: { reply: Function } & Record<string, unknown>,
  page: number
) {
  const items = (await prisma.$queryRawUnsafe(
    `
    WITH latest AS (
      SELECT DISTINCT ON ("itemId")
        "itemId", "medianPrice", "lowestPrice", "volume24h"
      FROM "PriceSnapshot"
      ORDER BY "itemId", "ts" DESC
    ),
    prior AS (
      WITH ranked AS (
        SELECT "itemId", "medianPrice",
               ROW_NUMBER() OVER (PARTITION BY "itemId" ORDER BY "ts" DESC) rn
        FROM "PriceSnapshot"
        WHERE "medianPrice" IS NOT NULL
      )
      SELECT "itemId", "medianPrice" FROM ranked WHERE rn = 2
    ),
    sbox AS (
      SELECT "itemId", units FROM "SboxGameStat" WHERE timeframe = 'all'
    )
    SELECT i.id, i.name, i."marketHashName",
           COALESCE(l."medianPrice", l."lowestPrice")::float AS price,
           CASE WHEN p."medianPrice" > 0
             THEN (l."medianPrice" - p."medianPrice") / p."medianPrice"
             ELSE NULL END::float AS delta,
           l."volume24h"::int AS vol,
           s.units AS stock
    FROM "Item" i
    JOIN latest l ON l."itemId" = i.id
    LEFT JOIN prior p ON p."itemId" = i.id
    LEFT JOIN sbox s ON s."itemId" = i.id
    WHERE l."medianPrice" IS NOT NULL
    ORDER BY l."volume24h" DESC NULLS LAST
    `
  )) as Array<{
    id: number;
    name: string;
    marketHashName: string;
    price: number;
    delta: number | null;
    vol: number | null;
    stock: number | null;
  }>;

  const cur = await getCurrency();
  const total = items.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = items.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  let text = `📊 *Рынок* \\(${total} items, стр\\. ${p + 1}/${pages}\\)\n\n`;

  for (const r of slice) {
    const d =
      r.delta != null
        ? r.delta >= 0
          ? ` 🟢 ${esc(pct(r.delta))}`
          : ` 🔴 ${esc(pct(r.delta))}`
        : "";
    text +=
      `*${esc(r.name)}*${d}\n` +
      `${esc(money(r.price, cur))}`;
    if (r.vol) text += ` \\| vol: ${r.vol}`;
    if (r.stock) text += ` \\| stock: ${esc(r.stock.toLocaleString())}`;
    text += "\n\n";
  }

  // Build keyboard: per-item row with [Chart] [Steam], then pagination.
  const kb = new InlineKeyboard();
  for (const r of slice) {
    kb.text(`📈 ${r.name.slice(0, 16)}`, `chart:${r.id}`)
      .url(
        "Steam ↗",
        `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(r.marketHashName)}`
      )
      .row();
  }
  // Pagination row.
  if (p > 0) kb.text("◀ Prev", `market:${p - 1}`);
  kb.text(`${p + 1}/${pages}`, "noop");
  if (p < pages - 1) kb.text("Next ▶", `market:${p + 1}`);
  kb.row().text("← Меню", "menu:back");

  await ctx.reply(text, {
    parse_mode: "MarkdownV2",
    reply_markup: kb,
  });
}
