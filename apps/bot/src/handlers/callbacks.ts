import type { CallbackQueryContext, Context } from "grammy";

// Map chatId → feedbackId waiting for text comment.
export const pendingFeedbackText = new Map<number, number>();
import { prisma } from "@sbox/db";
import { InputFile } from "grammy";
import { sendMarketPage } from "./market.js";
import { renderChart } from "./chart.js";
import { money, esc } from "../lib/format.js";
import { mainMenu, HELP_TEXT } from "./start.js";

// Inline handlers wired to menu buttons
import { marketHandler } from "./market.js";
import { topHandler, sendMoversPage } from "./top.js";
import { statsHandler } from "./stats.js";
import { momentumHandler, bluechipsHandler } from "./deals.js";
import { watchlistHandler, sendWatchlistBrowse } from "./watchlist.js";
import { portfolioHandler, pendingEditPrice, pendingAdd } from "./portfolio.js";
import { alertsHandler } from "./alert.js";
import { refreshHandler } from "./refresh.js";
import { feedbackHandler } from "./feedback.js";
import { settingsHandler } from "./settings.js";
import { importHandler } from "./import.js";

export async function callbackRouter(ctx: CallbackQueryContext<Context>) {
  const data = ctx.callbackQuery.data;
  if (!data) return;

  try {
    // ── Menu navigation ─────────────────────────────────────────────
    if (data.startsWith("menu:")) {
      const section = data.split(":")[1];
      await ctx.answerCallbackQuery();
      // Delete the message with the menu buttons to keep chat clean.
      try { await ctx.deleteMessage(); } catch {};

      // Map menu buttons to handlers (reuse command handlers as-is)
      switch (section) {
        case "market":
          await sendMarketPage(ctx, 0);
          return;
        case "top":
          await topHandler(ctx as any);
          return;
        case "stats":
          await statsHandler(ctx as any);
          return;
        case "momentum":
          await momentumHandler(ctx as any);
          return;
        case "bluechips":
          await bluechipsHandler(ctx as any);
          return;
        case "watchlist":
          await watchlistHandler(ctx as any);
          return;
        case "portfolio":
          await portfolioHandler(ctx as any);
          return;
        case "alerts":
          await alertsHandler(ctx as any);
          return;
        case "refresh":
          await refreshHandler(ctx as any);
          return;
        case "feedback":
          await feedbackHandler(ctx as any);
          return;
        case "settings":
          await settingsHandler(ctx as any);
          return;
        case "import":
          await ctx.reply(
            "📦 *Импорт инвентаря*\n\nОтправьте команду с вашим профилем:\n\n" +
              "`/import DikiiDecay`\n" +
              "`/import 76561198066344484`\n" +
              "`/import https://steamcommunity\\.com/id/DikiiDecay/`",
            { parse_mode: "MarkdownV2" }
          );
          return;
        case "help":
          await ctx.reply(HELP_TEXT, {
            parse_mode: "MarkdownV2",
            reply_markup: mainMenu(),
          });
          return;
        case "back":
          await ctx.reply("🎮 *Главное меню*", {
            parse_mode: "MarkdownV2",
            reply_markup: mainMenu(),
          });
          return;
      }
    }

    // ── Market pagination ───────────────────────────────────────────
    if (data.startsWith("market:")) {
      const page = parseInt(data.split(":")[1], 10);
      await ctx.answerCallbackQuery();
      try { await ctx.deleteMessage(); } catch {};
      await sendMarketPage(ctx, page);
      return;
    }

    // ── Movers pagination ───────────────────────────────────────────
    if (data.startsWith("movers:")) {
      const page = parseInt(data.split(":")[1], 10);
      await ctx.answerCallbackQuery();
      try { await ctx.deleteMessage(); } catch {};
      await sendMoversPage(ctx, page);
      return;
    }

    // ── Watchlist toggle (from /item inline button) ──────────────────
    if (data.startsWith("watch:")) {
      const userId = String(ctx.callbackQuery.from.id);
      const itemId = parseInt(data.split(":")[1], 10);
      const existing = await prisma.watchlist.findFirst({ where: { userId, itemId } });
      if (existing) {
        await prisma.watchlist.delete({ where: { id: existing.id } });
        await ctx.answerCallbackQuery({ text: "❌ Убрано из watchlist" });
      } else {
        await prisma.watchlist.create({ data: { itemId, userId } });
        await ctx.answerCallbackQuery({ text: "⭐ Добавлено!" });
      }
      return;
    }

    // ── Watchlist browse (paginated item picker) ──────────────────
    if (data.startsWith("wl:browse:")) {
      const page = parseInt(data.split(":")[2], 10);
      await ctx.answerCallbackQuery();
      try { await ctx.deleteMessage(); } catch {};
      await sendWatchlistBrowse(ctx, page);
      return;
    }

    // ── Watchlist toggle from browse view ─────────────────────────
    if (data.startsWith("wl:toggle:")) {
      const userId = String(ctx.callbackQuery.from.id);
      const itemId = parseInt(data.split(":")[2], 10);
      const existing = await prisma.watchlist.findFirst({ where: { userId, itemId } });
      if (existing) {
        await prisma.watchlist.delete({ where: { id: existing.id } });
        await ctx.answerCallbackQuery({ text: "❌ Убрано" });
      } else {
        await prisma.watchlist.create({ data: { itemId, userId } });
        await ctx.answerCallbackQuery({ text: "⭐ Добавлено!" });
      }
      // Refresh the browse page (re-render current page with updated stars).
      // Extract current page from the message text.
      const msgText = ctx.callbackQuery.message?.text ?? "";
      const pageMatch = msgText.match(/стр\. (\d+)/);
      const curPage = pageMatch ? parseInt(pageMatch[1], 10) - 1 : 0;
      try { await ctx.deleteMessage(); } catch {};
      await sendWatchlistBrowse(ctx, curPage);
      return;
    }

    // ── Watchlist remove ──────────────────────────────────────────
    if (data.startsWith("wl:rm:")) {
      const userId = String(ctx.callbackQuery.from.id);
      const itemId = parseInt(data.split(":")[2], 10);
      await prisma.watchlist.deleteMany({ where: { itemId, userId } });
      await ctx.answerCallbackQuery({ text: "❌ Убрано" });
      try { await ctx.deleteMessage(); } catch {};
      // Re-render watchlist.
      await watchlistHandler(ctx as any);
      return;
    }

    // ── Chart render ────────────────────────────────────────────────
    if (data.startsWith("chart:")) {
      const itemId = parseInt(data.split(":")[1], 10);
      await ctx.answerCallbackQuery({ text: "📈 Rendering chart..." });
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) return;
      const buf = await renderChart(item.id, item.name);
      await ctx.replyWithPhoto(new InputFile(buf, `chart_${item.id}.png`));
      return;
    }

    // ── Buy prompt ──────────────────────────────────────────────────
    if (data.startsWith("buyprompt:")) {
      const itemId = parseInt(data.split(":")[1], 10);
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) return;
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `🛒 Чтобы купить *${esc(item.name)}*, отправь:\n\`/buy ${item.name} <кол\\-во> <цена>\``,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    // ── Alert prompt ────────────────────────────────────────────────
    if (data.startsWith("alertprompt:")) {
      const itemId = parseInt(data.split(":")[1], 10);
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) return;
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `🔔 Алерт для *${esc(item.name)}*:\n` +
          `\`/alert ${item.name} above <цена>\`\n` +
          `\`/alert ${item.name} below <цена>\``,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    // ── Feedback rating → then ask for text ──────────────────────────
    if (data.startsWith("feedback:")) {
      const rating = parseInt(data.split(":")[1], 10);
      const user = ctx.callbackQuery.from;
      console.log(
        `[feedback] user=${user.id} (${user.username ?? "?"}) rating=${rating}`
      );
      // Save rating immediately (text will be added later if user sends one).
      const fb = await prisma.feedback.create({
        data: {
          userId: String(user.id),
          username: user.username ?? null,
          rating,
        },
      });
      await ctx.answerCallbackQuery({ text: `Оценка: ${rating}/5` });
      await ctx.editMessageText(
        `${"⭐".repeat(rating)} — спасибо\\!\n\n` +
          `Напишите текстовый комментарий \\(что понравилось, что улучшить\\)\\.\n` +
          `Или отправьте /skip чтобы пропустить\\.`,
        { parse_mode: "MarkdownV2" }
      );
      // Store the feedback ID so the next text message gets attached.
      // We use a simple in-memory map keyed by chat ID.
      pendingFeedbackText.set(ctx.chat!.id, fb.id);
      return;
    }

    // ── Portfolio add (step-by-step) ────────────────────────────────
    if (data === "pf:addstart") {
      await ctx.answerCallbackQuery();
      const userId = String(ctx.callbackQuery.from.id);
      pendingAdd.set(ctx.chat!.id, { step: "name", userId });
      await ctx.reply(
        "➕ *Добавить вещь в портфолио*\n\nВведите название предмета \\(или часть\\):",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    // ── Portfolio edit / delete ────────────────────────────────────
    if (data.startsWith("pf:edit:")) {
      const userId = String(ctx.callbackQuery.from.id);
      const posId = parseInt(data.split(":")[2], 10);
      const pos = await prisma.position.findUnique({
        where: { id: posId },
        include: { item: true },
      });
      if (!pos || pos.userId !== userId) {
        await ctx.answerCallbackQuery({ text: "Позиция не найдена" });
        return;
      }
      await ctx.answerCallbackQuery();
      pendingEditPrice.set(ctx.chat!.id, posId);
      const cur = await (await import("../lib/format.js")).getCurrency();
      const curLabel = cur.code === "KZT" ? "₸ KZT" : "$ USD";
      await ctx.reply(
        `✏️ *Редактирование: ${esc(pos.item.name)}*\n\n` +
          `Текущая цена покупки: ${esc(money(Number(pos.buyPrice), cur))}\n` +
          `Кол\\-во: ${pos.qty}\n\n` +
          `Введите новую цену покупки в *${esc(curLabel)}*:`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    if (data.startsWith("pf:del:")) {
      const userId = String(ctx.callbackQuery.from.id);
      const posId = parseInt(data.split(":")[2], 10);
      const pos = await prisma.position.findUnique({ where: { id: posId } });
      if (!pos || pos.userId !== userId) {
        await ctx.answerCallbackQuery({ text: "Позиция не найдена" });
        return;
      }
      await prisma.position.delete({ where: { id: posId } }).catch(() => {});
      await ctx.answerCallbackQuery({ text: "🗑 Удалено" });
      try { await ctx.deleteMessage(); } catch {};
      await portfolioHandler(ctx as any);
      return;
    }

    // ── Currency switch ───────────────────────────────────────────
    if (data.startsWith("setcur:")) {
      const code = data.split(":")[1]; // "USD" or "KZT"
      await prisma.settings.upsert({
        where: { id: 1 },
        create: { id: 1, currency: code },
        update: { currency: code },
      });
      const sym = code === "KZT" ? "₸" : "$";
      await ctx.answerCallbackQuery({ text: `Валюта: ${sym} ${code}` });
      await ctx.editMessageText(
        `✅ Валюта переключена на *${code}*\n\nВсе цены теперь отображаются в ${sym}\\.`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    if (data === "noop") {
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery({ text: "Unknown action" }).catch(() => {});
  } catch (err) {
    console.error("callback error:", err);
    await ctx.answerCallbackQuery({ text: "Ошибка" }).catch(() => {});
  }
}
