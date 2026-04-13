import type { CommandContext, Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "@sbox/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HERO_PATH = resolve(__dirname, "../../../../apps/web/public/hero.png");

// Fetch live stats for the welcome message (always in USD).
async function getStatsText(): Promise<string> {
  try {
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

    const c = cap[0];
    const v = vol[0];
    const fmtK = (n: number) =>
      n >= 1_000_000
        ? `$${(n / 1_000_000).toFixed(2)}M`
        : n >= 1_000
          ? `$${(n / 1_000).toFixed(1)}k`
          : `$${n.toFixed(0)}`;

    return (
      `📊 Market Cap: *${esc(fmtK(c.cap))}*\n` +
      `📈 Volume 24h: *${esc(fmtK(v.vol_usd))}* \\(${v.sales} sales\\)\n` +
      `🎮 Items: *${v.items}* \\| Stock: *${esc(c.stock.toLocaleString())}*`
    );
  } catch {
    return "📊 _Статистика загружается\\.\\.\\._";
  }
}

function mainMenu() {
  return new InlineKeyboard()
    .text("🏆 Топ Movers", "menu:top")
    .row()
    .text("🔥 Hot", "menu:momentum")
    .text("🏦 Blue Chips", "menu:bluechips")
    .row()
    .text("⭐ Watchlist", "menu:watchlist")
    .text("🔔 Алерты", "menu:alerts")
    .row()
    .text("💼 Портфолио", "menu:portfolio")
    .text("📦 Импорт Steam", "menu:import")
    .row()
    .text("🔄 Обновить", "menu:refresh")
    .text("⚙️ Настройки", "menu:settings")
    .row()
    .text("💬 Отзыв", "menu:feedback")
    .text("📖 Команды", "menu:help");
}

const HELP_TEXT = `📖 *Все команды*

📊 *Рынок*
/market — таблица всех предметов
/item _название_ — детальная карточка
/top — top 25 movers 24h
/momentum — top по 30d
/bluechips — top по lifetime revenue
/chart _item_ — график цены

💼 *Портфолио*
/portfolio — позиции \\+ PnL
/import _ссылка_ — импорт из Steam
/buy _item qty price_ — купить
/sell _id price_ — продать
/export — CSV

⭐ *Watchlist \\& Alerts*
/watchlist — избранное
/alert _item above/below price_
/alerts — мои алерты

🔧 *Прочее*
/refresh — обновить данные
/settings — валюта USD/KZT
/feedback — оставить отзыв`;

export { mainMenu, HELP_TEXT };

// Keep for backward compat
const WELCOME = "";

export { WELCOME };

export async function startHandler(ctx: CommandContext<Context>) {
  const stats = await getStatsText();

  const caption =
    `🎮 *s\\&box Market Terminal*\n\n` +
    `${stats}\n\n` +
    `Инвестиционный терминал для рынка скинов s\\&box\\.\n` +
    `Данные обновляются каждые 10 мин\\.\n\n` +
    `Выбери раздел 👇`;

  try {
    const photo = readFileSync(HERO_PATH);
    await ctx.replyWithPhoto(new InputFile(photo, "hero.png"), {
      caption,
      parse_mode: "MarkdownV2",
      reply_markup: mainMenu(),
    });
  } catch {
    await ctx.reply(caption, {
      parse_mode: "MarkdownV2",
      reply_markup: mainMenu(),
    });
  }
}

function esc(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
