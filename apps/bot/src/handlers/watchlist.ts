import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";
import { money, getCurrency } from "../lib/format.js";

// /watchlist — show watched items + browse button to add more.
export async function watchlistHandler(ctx: CommandContext<Context>) {
  const userId = String(ctx.from!.id);
  const cur = await getCurrency();
  const watched = await prisma.watchlist.findMany({
    where: { userId },
    include: {
      item: { select: { id: true, name: true, marketHashName: true } },
    },
  });

  const prices = watched.length
    ? ((await prisma.$queryRawUnsafe(
        `SELECT DISTINCT ON ("itemId") "itemId", "medianPrice"::float
         FROM "PriceSnapshot" WHERE "itemId" = ANY($1::int[])
         ORDER BY "itemId", "ts" DESC`,
        watched.map((w) => w.itemId)
      )) as Array<{ itemId: number; medianPrice: number }>)
    : [];
  const priceMap = new Map(prices.map((p) => [p.itemId, p.medianPrice]));

  let text = "⭐ *Watchlist*\n\n";
  if (!watched.length) {
    text += "Пусто\\. Нажмите \\+ чтобы добавить предметы\\.";
  } else {
    for (const w of watched) {
      const p = priceMap.get(w.itemId);
      text += `• ${esc(w.item.name)} — ${esc(money(p ?? null, cur))}\n`;
    }
  }

  const kb = new InlineKeyboard().text("➕ Добавить предмет", "wl:browse:0").row();
  for (const w of watched) {
    kb.text(`❌ ${w.item.name.slice(0, 25)}`, `wl:rm:${w.itemId}`).row();
  }
  kb.text("← Меню", "menu:back");

  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
}

// Paginated item browser for watchlist.
export async function sendWatchlistBrowse(
  ctx: { reply: Function; from?: { id: number } },
  page: number
) {
  const userId = ctx.from ? String(ctx.from.id) : undefined;
  const PAGE = 12;
  const items = await prisma.item.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const watched = await prisma.watchlist.findMany({
    where: { userId },
    select: { itemId: true },
  });
  const watchSet = new Set(watched.map((w) => w.itemId));

  const pages = Math.ceil(items.length / PAGE);
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = items.slice(p * PAGE, (p + 1) * PAGE);

  const kb = new InlineKeyboard();
  for (let i = 0; i < slice.length; i += 2) {
    const a = slice[i];
    const b = slice[i + 1];
    kb.text(
      `${watchSet.has(a.id) ? "⭐" : "☆"} ${a.name.slice(0, 20)}`,
      `wl:toggle:${a.id}`
    );
    if (b) {
      kb.text(
        `${watchSet.has(b.id) ? "⭐" : "☆"} ${b.name.slice(0, 20)}`,
        `wl:toggle:${b.id}`
      );
    }
    kb.row();
  }

  if (p > 0) kb.text("◀", `wl:browse:${p - 1}`);
  kb.text(`${p + 1}/${pages}`, "noop");
  if (p < pages - 1) kb.text("▶", `wl:browse:${p + 1}`);
  kb.row().text("✅ Готово", "menu:watchlist");

  await ctx.reply(
    `⭐ *Выберите предметы* \\(стр\\. ${p + 1}/${pages}\\)\n\nНажмите чтобы добавить/убрать:`,
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
}

function esc(s: string) {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
