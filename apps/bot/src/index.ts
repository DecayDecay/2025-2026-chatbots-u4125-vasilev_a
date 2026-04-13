import { Bot } from "grammy";
import { env } from "./env.js";

// Handlers
import { startHandler } from "./handlers/start.js";
import { marketHandler } from "./handlers/market.js";
import { itemHandler } from "./handlers/item.js";
import { topHandler } from "./handlers/top.js";
import { statsHandler } from "./handlers/stats.js";
import { watchlistHandler } from "./handlers/watchlist.js";
import { alertHandler, alertsHandler } from "./handlers/alert.js";
import {
  portfolioHandler,
  buyHandler,
  sellHandler,
  pendingEditPrice,
  pendingAdd,
} from "./handlers/portfolio.js";
import {
  momentumHandler,
  bluechipsHandler,
} from "./handlers/deals.js";
import { refreshHandler } from "./handlers/refresh.js";
import { chartHandler } from "./handlers/chart.js";
import { feedbackHandler } from "./handlers/feedback.js";
import { exportHandler } from "./handlers/export.js";
import { settingsHandler } from "./handlers/settings.js";
import { importHandler, pendingPaste, handlePastedJson, appendPasteChunk, pasteBuffer } from "./handlers/import.js";
import { callbackRouter, pendingFeedbackText } from "./handlers/callbacks.js";
import { prisma } from "@sbox/db";

const bot = new Bot(env.botToken);

// Register commands
bot.command("start", startHandler);
bot.command("help", startHandler);
bot.command("market", marketHandler);
bot.command("item", itemHandler);
bot.command("top", topHandler);
bot.command("stats", statsHandler);
bot.command("watchlist", watchlistHandler);
bot.command("alert", alertHandler);
bot.command("alerts", alertsHandler);
bot.command("portfolio", portfolioHandler);
bot.command("buy", buyHandler);
bot.command("sell", sellHandler);
bot.command("momentum", momentumHandler);
bot.command("bluechips", bluechipsHandler);
bot.command("refresh", refreshHandler);
bot.command("chart", chartHandler);
bot.command("feedback", feedbackHandler);
bot.command("export", exportHandler);
bot.command("settings", settingsHandler);
bot.command("import", importHandler);

// Inline keyboard callbacks
bot.on("callback_query:data", callbackRouter);

// Catch text messages for feedback comments (and /skip to skip).
bot.command("skip", async (ctx) => {
  const chatId = ctx.chat.id;
  if (pendingFeedbackText.has(chatId)) {
    pendingFeedbackText.delete(chatId);
    await ctx.reply("Ок, комментарий пропущен. Спасибо за оценку!");
  }
});

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;

  // Check if user is pasting inventory JSON (from /import manual method).
  // Telegram splits long messages into ~4096 char chunks, so we buffer them.
  if (pendingPaste.has(chatId) || pasteBuffer.has(chatId)) {
    const trimmed = text.trim();
    // Looks like JSON start or continuation of a buffered paste.
    if (trimmed.startsWith("{") || pasteBuffer.has(chatId)) {
      const complete = appendPasteChunk(chatId, text);
      if (complete) {
        // Full JSON assembled — process it.
        await handlePastedJson(ctx, chatId, complete);
      }
      // If not complete yet, silently wait for more chunks.
      return;
    }
  }

  // Check if user is in the add-item flow.
  const addState = pendingAdd.get(chatId);
  if (addState) {
    const input = text.trim();

    if (addState.step === "name") {
      // Search item by name.
      const item = await prisma.item.findFirst({
        where: { name: { contains: input, mode: "insensitive" } },
      });
      if (!item) {
        await ctx.reply(`❌ Предмет «${input}» не найден. Попробуйте ещё раз (или /portfolio для отмены):`);
        return;
      }
      addState.itemId = item.id;
      addState.itemName = item.name;
      addState.step = "qty";
      await ctx.reply(`✅ *${item.name.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1")}*\n\nВведите количество:`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    if (addState.step === "qty") {
      const qty = parseInt(input, 10);
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply("❌ Введите положительное целое число:");
        return;
      }
      addState.qty = qty;
      addState.step = "price";
      const { getCurrency } = await import("./handlers/../lib/format.js");
      const cur = await getCurrency();
      const label = cur.code === "KZT" ? "₸ KZT" : "$ USD";
      await ctx.reply(`Введите цену покупки в *${label.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1")}*:`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    if (addState.step === "price") {
      const inputPrice = parseFloat(input.replace(/\s/g, "").replace(",", "."));
      if (isNaN(inputPrice) || inputPrice <= 0) {
        await ctx.reply("❌ Введите положительное число:");
        return;
      }
      const { getCurrency } = await import("./handlers/../lib/format.js");
      const cur = await getCurrency();
      const usdPrice = cur.code === "KZT" && cur.rate > 0 ? inputPrice / cur.rate : inputPrice;

      await prisma.position.create({
        data: {
          userId: addState.userId,
          itemId: addState.itemId!,
          qty: addState.qty!,
          buyPrice: usdPrice,
          buyDate: new Date(),
        },
      });
      pendingAdd.delete(chatId);

      const displayPrice = cur.code === "KZT"
        ? `₸${inputPrice.toFixed(0)} (= $${usdPrice.toFixed(2)})`
        : `$${usdPrice.toFixed(2)}`;
      await ctx.reply(
        `✅ Добавлено: *${addState.itemName!.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1")}* ×${addState.qty} @ ${displayPrice}\n\n/portfolio — посмотреть`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }
  }

  // Check if user is editing a position buy price.
  const editPosId = pendingEditPrice.get(chatId);
  if (editPosId) {
    pendingEditPrice.delete(chatId);
    const inputPrice = parseFloat(text.replace(/\s/g, "").replace(",", ".").trim());
    if (isNaN(inputPrice) || inputPrice <= 0) {
      await ctx.reply("❌ Введите положительное число. Попробуйте снова через /portfolio");
      return;
    }
    // If currency is KZT, convert input to USD for storage.
    const { getCurrency } = await import("./handlers/../lib/format.js");
    const cur = await getCurrency();
    const usdPrice = cur.code === "KZT" && cur.rate > 0
      ? inputPrice / cur.rate
      : inputPrice;
    await prisma.position.update({
      where: { id: editPosId },
      data: { buyPrice: usdPrice },
    });
    const displayPrice = cur.code === "KZT"
      ? `₸${inputPrice.toFixed(0)} (= $${usdPrice.toFixed(2)})`
      : `$${usdPrice.toFixed(2)}`;
    await ctx.reply(`✅ Цена покупки обновлена: ${displayPrice}\n/portfolio — посмотреть`);
    return;
  }

  // Check if user is leaving feedback text.
  const fbId = pendingFeedbackText.get(chatId);
  if (!fbId) return;
  pendingFeedbackText.delete(chatId);
  await prisma.feedback.update({
    where: { id: fbId },
    data: { text: text.slice(0, 1000) },
  });
  await ctx.reply("💬 Комментарий сохранён. Спасибо за обратную связь!");
});

// Silently swallow stale callback query errors (user clicked old button).
bot.catch((err) => {
  const msg = String(err.error?.description ?? err.error ?? "");
  if (msg.includes("query is too old")) return;
  console.error("Bot error:", err.error);
});

// Start
bot.start({
  onStart: (me) => {
    console.log(`Bot @${me.username} started (${me.first_name})`);
  },
});
