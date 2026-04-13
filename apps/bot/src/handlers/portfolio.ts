import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";
import { money, pct, esc, getCurrency } from "../lib/format.js";
import { backButton } from "../lib/keyboard.js";

const STEAM_FEE = 0.87;

export const pendingEditPrice = new Map<number, number>();

// Step-by-step add flow: chatId → current step state.
export const pendingAdd = new Map<
  number,
  { step: "name" | "qty" | "price"; itemId?: number; itemName?: string; qty?: number; userId: string }
>();

interface GroupedPosition {
  itemId: number;
  itemName: string;
  totalQty: number;
  avgBuy: number;
  totalCost: number;
  positionIds: number[];
  buyPrices: Array<{ id: number; qty: number; price: number }>;
}

export async function portfolioHandler(ctx: CommandContext<Context>) {
  try {
    const userId = String(ctx.from!.id);
    const cur = await getCurrency();
    const positions = await prisma.position.findMany({
      where: { sellPrice: null, userId },
      include: { item: true },
      orderBy: { buyDate: "desc" },
    });

    if (!positions.length) {
      const emptyKb = new InlineKeyboard()
        .text("➕ Добавить вещь", "pf:addstart")
        .row()
        .text("📦 Импорт Steam", "menu:import")
        .row()
        .text("← Меню", "menu:back");
      await ctx.reply(
        "💼 Портфолио пусто\\.\n\nДобавьте вещь вручную или импортируйте из Steam\\.",
        { parse_mode: "MarkdownV2", reply_markup: emptyKb }
      );
      return;
    }

    // Group positions by item.
    const groups = new Map<number, GroupedPosition>();
    for (const pos of positions) {
      const buy = Number(pos.buyPrice);
      let g = groups.get(pos.itemId);
      if (!g) {
        g = {
          itemId: pos.itemId,
          itemName: pos.item.name,
          totalQty: 0,
          avgBuy: 0,
          totalCost: 0,
          positionIds: [],
          buyPrices: [],
        };
        groups.set(pos.itemId, g);
      }
      g.totalQty += pos.qty;
      g.totalCost += buy * pos.qty;
      g.positionIds.push(pos.id);
      g.buyPrices.push({ id: pos.id, qty: pos.qty, price: buy });
    }
    for (const g of groups.values()) {
      g.avgBuy = g.totalCost / g.totalQty;
    }

    // Get current prices.
    const itemIds = [...groups.keys()];
    const prices = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT ON ("itemId") "itemId",
              COALESCE("medianPrice", "lowestPrice")::float AS price
       FROM "PriceSnapshot" WHERE "itemId" = ANY($1::int[])
       ORDER BY "itemId", "ts" DESC`,
      itemIds
    )) as Array<{ itemId: number; price: number }>;
    const priceMap = new Map(prices.map((p) => [p.itemId, p.price]));

    let totalPnl = 0;
    let totalCost = 0;
    let totalValue = 0;

    let text = "💼 *Портфолио*\n\n";

    const groupList = [...groups.values()].sort(
      (a, b) => b.totalCost - a.totalCost
    );

    for (const g of groupList) {
      const now = priceMap.get(g.itemId) ?? 0;
      const value = now * STEAM_FEE * g.totalQty;
      const pnl = value - g.totalCost;
      totalPnl += pnl;
      totalCost += g.totalCost;
      totalValue += value;

      const pnlPct = g.totalCost > 0 ? pnl / g.totalCost : 0;
      const arrow = pnl >= 0 ? "🟢" : "🔴";

      text += `${arrow} *${esc(g.itemName)}* ×${g.totalQty}\n`;
      text += `   Avg buy: ${esc(money(g.avgBuy, cur))} → Now: ${esc(money(now, cur))}\n`;
      text += `   PnL: ${esc(money(pnl, cur))} \\(${esc(pct(pnlPct))}\\)`;

      // Show individual prices if multiple buys at different prices.
      if (g.buyPrices.length > 1) {
        const uniq = new Set(g.buyPrices.map((p) => p.price));
        if (uniq.size > 1) {
          text += `\n   _${g.buyPrices.map((p) => `${p.qty}×${money(p.price, cur)}`).join(", ")}_`;
        }
      }
      text += "\n\n";
    }

    const totalPnlPct = totalCost > 0 ? totalPnl / totalCost : 0;
    text +=
      `━━━━━━━━━━━━━━━━━\n` +
      `💰 Стоимость: ${esc(money(totalValue, cur))}\n` +
      `💵 Вложено: ${esc(money(totalCost, cur))}\n` +
      `📊 PnL: *${esc(money(totalPnl, cur))}* \\(${esc(pct(totalPnlPct))}\\)\n` +
      `_после 13% комиссии Steam_`;

    // Buttons: edit per position, not per group.
    const kb = new InlineKeyboard();
    for (const g of groupList) {
      if (g.buyPrices.length === 1) {
        kb.text(`✏️ ${g.itemName.slice(0, 18)}`, `pf:edit:${g.positionIds[0]}`)
          .text(`🗑`, `pf:del:${g.positionIds[0]}`)
          .row();
      } else {
        // Multiple positions — show expand button.
        for (const p of g.buyPrices) {
          kb.text(
            `✏️ ${g.itemName.slice(0, 12)} ${p.qty}×$${p.price.toFixed(2)}`,
            `pf:edit:${p.id}`
          )
            .text(`🗑`, `pf:del:${p.id}`)
            .row();
        }
      }
    }
    kb.text("➕ Добавить вещь", "pf:addstart").row();
    kb.text("← Меню", "menu:back");

    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
  } catch (err) {
    console.error("portfolio error:", err);
    await ctx.reply("Ошибка загрузки портфолио.");
  }
}

export async function buyHandler(ctx: CommandContext<Context>) {
  try {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply(
        "Usage: /buy <item name> <qty> <price>\nExample: /buy SWAG Chain 1 15"
      );
      return;
    }
    const parts = raw.split(/\s+/);
    if (parts.length < 3) {
      await ctx.reply("Usage: /buy <item name> <qty> <price>");
      return;
    }
    const price = parseFloat(parts.pop()!);
    const qty = parseInt(parts.pop()!, 10);
    const itemName = parts.join(" ");
    if (isNaN(price) || isNaN(qty) || qty <= 0 || price <= 0) {
      await ctx.reply("Некорректные значения.");
      return;
    }
    const item = await prisma.item.findFirst({
      where: { name: { contains: itemName, mode: "insensitive" } },
    });
    if (!item) {
      await ctx.reply(`Предмет "${itemName}" не найден.`);
      return;
    }
    const cur = await getCurrency();
    const userId = String(ctx.from!.id);
    await prisma.position.create({
      data: { itemId: item.id, qty, buyPrice: price, buyDate: new Date(), userId },
    });
    await ctx.reply(
      `✅ *${esc(item.name)}* ×${qty} @ ${esc(money(price, cur))}\n/portfolio — посмотреть`,
      { parse_mode: "MarkdownV2", reply_markup: backButton() }
    );
  } catch (err) {
    console.error("buy error:", err);
    await ctx.reply("Ошибка.");
  }
}

export async function sellHandler(ctx: CommandContext<Context>) {
  try {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply("Usage: /sell <id> <price>\nID видно в /portfolio");
      return;
    }
    const parts = raw.split(/\s+/);
    const posId = parseInt(parts[0], 10);
    const sellPrice = parseFloat(parts[1]);
    if (isNaN(posId) || isNaN(sellPrice) || sellPrice <= 0) {
      await ctx.reply("Некорректные значения.");
      return;
    }
    const userId = String(ctx.from!.id);
    const pos = await prisma.position.findUnique({
      where: { id: posId },
      include: { item: true },
    });
    if (!pos) { await ctx.reply("Позиция не найдена."); return; }
    if (pos.userId !== userId) { await ctx.reply("Позиция не найдена."); return; }
    if (pos.sellPrice) { await ctx.reply("Уже закрыта."); return; }
    await prisma.position.update({
      where: { id: posId },
      data: { sellPrice, sellDate: new Date() },
    });
    const buy = Number(pos.buyPrice);
    const pnl = (sellPrice * STEAM_FEE - buy) * pos.qty;
    const cur = await getCurrency();
    await ctx.reply(
      `✅ Позиция \\#${posId} закрыта\n` +
        `*${esc(pos.item.name)}* ×${pos.qty}\n` +
        `PnL: *${esc(money(pnl, cur))}*`,
      { parse_mode: "MarkdownV2", reply_markup: backButton() }
    );
  } catch (err) {
    console.error("sell error:", err);
    await ctx.reply("Ошибка.");
  }
}
