import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";
import { money, pct, esc, getCurrency } from "../lib/format.js";

const PAGE_SIZE = 10;

export async function topHandler(ctx: CommandContext<Context>) {
  await sendMoversPage(ctx, 0);
}

export async function sendMoversPage(
  ctx: { reply: Function } & Record<string, unknown>,
  page: number
) {
  const rows = (await prisma.$queryRawUnsafe(
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
    WHERE l."medianPrice" IS NOT NULL AND p."medianPrice" IS NOT NULL
    ORDER BY ABS(CASE WHEN p."medianPrice" > 0
      THEN (l."medianPrice" - p."medianPrice") / p."medianPrice"
    END) DESC NULLS LAST
    LIMIT 20
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

  if (!rows.length) {
    await ctx.reply("Недостаточно данных\\. Нужно ≥2 снэпшота\\.", {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  const cur = await getCurrency();
  const total = rows.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = rows.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  let text = `🏆 *Top Movers 24h* · стр\\. ${p + 1}/${pages}\n\n`;

  for (let i = 0; i < slice.length; i++) {
    const r = slice[i];
    const rank = p * PAGE_SIZE + i + 1;
    const arrow = r.delta != null ? (r.delta >= 0 ? "🟢" : "🔴") : "⚪";
    const delta = r.delta != null ? esc(pct(r.delta)) : "—";

    text += `${arrow} *${rank}\\. ${esc(r.name)}*  ${delta}\n`;
    text += `    ${esc(money(r.price, cur))}`;
    if (r.vol) text += `  ·  vol ${r.vol}`;
    if (r.stock) text += `  ·  ${esc(r.stock.toLocaleString())} шт`;
    text += "\n";
  }

  const kb = new InlineKeyboard();
  for (let i = 0; i < Math.min(5, slice.length); i++) {
    const r = slice[i];
    kb.text(`📈 ${r.name.slice(0, 16)}`, `chart:${r.id}`)
      .url("Steam", `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(r.marketHashName)}`)
      .row();
  }
  if (p > 0) kb.text("◀", `movers:${p - 1}`);
  kb.text(`${p + 1}/${pages}`, "noop");
  if (p < pages - 1) kb.text("▶", `movers:${p + 1}`);
  kb.row().text("← Меню", "menu:back");

  await ctx.reply(text, {
    parse_mode: "MarkdownV2",
    reply_markup: kb,
  });
}
