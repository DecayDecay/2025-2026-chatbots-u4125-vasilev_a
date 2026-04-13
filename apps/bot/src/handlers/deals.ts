import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";
import { money, pct, compact, esc, getCurrency } from "../lib/format.js";
import { backButton } from "../lib/keyboard.js";

/**
 * /deals — items where lowestPrice < medianPrice * 0.85 (snipe opportunities)
 */
export async function dealsHandler(ctx: CommandContext<Context>) {
  try {
    const cur = await getCurrency();
    const rows = (await prisma.$queryRawUnsafe(`
      WITH latest AS (
        SELECT DISTINCT ON ("itemId")
          "itemId", "medianPrice"::float AS median, "lowestPrice"::float AS lowest
        FROM "PriceSnapshot"
        ORDER BY "itemId", "ts" DESC
      )
      SELECT i.name, l.median, l.lowest,
             ROUND((1 - l.lowest / l.median)::numeric * 100, 1)::float AS discount
      FROM latest l
      JOIN "Item" i ON i.id = l."itemId"
      WHERE l.median > 0 AND l.lowest > 0
        AND l.lowest < l.median * 0.85
      ORDER BY discount DESC
      LIMIT 15
    `)) as Array<{ name: string; median: number; lowest: number; discount: number }>;

    if (!rows.length) {
      await ctx.reply("No deals found right now\\. All items are near median\\.", {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    let text = "🔥 *Deals* \\(lowest < 85% median\\)\n\n";
    text += "```\n";
    text += "Item                 Lowest   Median  Disc%\n";
    text += "─".repeat(50) + "\n";
    for (const r of rows) {
      const name = r.name.slice(0, 19).padEnd(19);
      const low = money(r.lowest, cur).padStart(8);
      const med = money(r.median, cur).padStart(8);
      const disc = `${r.discount}%`.padStart(6);
      text += `${name} ${low} ${med} ${disc}\n`;
    }
    text += "```";

    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: backButton() });
  } catch (err) {
    console.error("deals error:", err);
    await ctx.reply("Failed to load deals. Try again later.");
  }
}

/**
 * /rare — items with sbox.game stock < 1000
 */
export async function rareHandler(ctx: CommandContext<Context>) {
  try {
    const cur = await getCurrency();
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT i.name, s.units AS stock,
             COALESCE(l."medianPrice", l."lowestPrice")::float AS price
      FROM "SboxGameStat" s
      JOIN "Item" i ON i.id = s."itemId"
      LEFT JOIN LATERAL (
        SELECT "medianPrice", "lowestPrice"
        FROM "PriceSnapshot"
        WHERE "itemId" = s."itemId"
        ORDER BY "ts" DESC LIMIT 1
      ) l ON true
      WHERE s.timeframe = 'all' AND s.units < 1000
      ORDER BY s.units ASC
      LIMIT 15
    `)) as Array<{ name: string; stock: number; price: number }>;

    if (!rows.length) {
      await ctx.reply("No rare items found \\(all stock ≥ 1000\\)\\.", {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    let text = "💎 *Rare Items* \\(stock < 1000\\)\n\n";
    text += "```\n";
    text += "Item                  Stock    Price\n";
    text += "─".repeat(44) + "\n";
    for (const r of rows) {
      const name = r.name.slice(0, 20).padEnd(20);
      const stock = String(r.stock).padStart(6);
      const price = money(r.price, cur).padStart(8);
      text += `${name} ${stock} ${price}\n`;
    }
    text += "```";

    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: backButton() });
  } catch (err) {
    console.error("rare error:", err);
    await ctx.reply("Failed to load rare items. Try again later.");
  }
}

/**
 * /momentum — top 10 by 30d momentum (30d revenue / lifetime revenue)
 */
export async function momentumHandler(ctx: CommandContext<Context>) {
  try {
    const cur = { code: "USD", rate: 1, sym: "$" } as const;
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT i.id, i.name, i."marketHashName",
             d.units AS units_30d,
             d."usdRevenue"::float AS rev_30d,
             COALESCE(l."medianPrice", l."lowestPrice")::float AS price
      FROM "SboxGameStat" d
      JOIN "Item" i ON i.id = d."itemId"
      LEFT JOIN LATERAL (
        SELECT "medianPrice", "lowestPrice"
        FROM "PriceSnapshot"
        WHERE "itemId" = d."itemId"
        ORDER BY "ts" DESC LIMIT 1
      ) l ON true
      WHERE d.timeframe = '30d' AND d.units > 0
      ORDER BY d.units DESC
      LIMIT 15
    `)) as Array<{
      id: number;
      name: string;
      marketHashName: string;
      units_30d: number;
      rev_30d: number;
      price: number;
    }>;

    if (!rows.length) {
      await ctx.reply("Нет данных за 30 дней\\.", { parse_mode: "MarkdownV2" });
      return;
    }

    let text = "🔥 *Hot — самые торгуемые за 30 дней*\n\n";

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}\\.`;
      const avgP = r.units_30d > 0 ? r.rev_30d / r.units_30d : 0;

      text +=
        `${medal} *${esc(r.name)}*\n` +
        `    💰 ${esc(money(r.price, cur))}  ·  📦 ${esc(r.units_30d.toLocaleString())} шт  ·  💵 ${esc(compact(r.rev_30d, cur))}\n`;
    }

    const kb = new InlineKeyboard();
    // Only show buttons for top 5 to keep it clean.
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const r = rows[i];
      kb.text(`📈 ${r.name.slice(0, 16)}`, `chart:${r.id}`)
        .url("Steam", `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(r.marketHashName)}`)
        .row();
    }
    kb.text("← Меню", "menu:back");

    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
  } catch (err) {
    console.error("hype error:", err);
    await ctx.reply("Ошибка загрузки. Попробуйте позже.");
  }
}

/**
 * /bluechips — top 10 by lifetime revenue
 */
export async function bluechipsHandler(ctx: CommandContext<Context>) {
  try {
    const cur = await getCurrency();
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT i.name,
             s."usdRevenue"::float AS revenue,
             s.units AS stock,
             COALESCE(l."medianPrice", l."lowestPrice")::float AS price
      FROM "SboxGameStat" s
      JOIN "Item" i ON i.id = s."itemId"
      LEFT JOIN LATERAL (
        SELECT "medianPrice", "lowestPrice"
        FROM "PriceSnapshot"
        WHERE "itemId" = s."itemId"
        ORDER BY "ts" DESC LIMIT 1
      ) l ON true
      WHERE s.timeframe = 'all'
      ORDER BY s."usdRevenue" DESC
      LIMIT 10
    `)) as Array<{ name: string; revenue: number; stock: number; price: number }>;

    if (!rows.length) {
      await ctx.reply("No sbox\\.game data available yet\\.", {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    let text = "🏦 *Blue Chips* \\(top lifetime revenue\\)\n\n";
    text += "```\n";
    text += "Item                 Price    Rev      Stock\n";
    text += "─".repeat(52) + "\n";
    for (const r of rows) {
      const name = r.name.slice(0, 19).padEnd(19);
      const price = money(r.price, cur).padStart(7);
      const rev = compact(r.revenue).padStart(8);
      const stock = String(r.stock).padStart(7);
      text += `${name} ${price} ${rev} ${stock}\n`;
    }
    text += "```";

    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: backButton() });
  } catch (err) {
    console.error("bluechips error:", err);
    await ctx.reply("Failed to load blue chips. Try again later.");
  }
}
