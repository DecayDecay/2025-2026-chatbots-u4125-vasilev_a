import type { CommandContext, Context } from "grammy";
import { prisma } from "@sbox/db";
import { money, esc, getCurrency } from "../lib/format.js";
import { backButton } from "../lib/keyboard.js";

/**
 * /alert <item> above/below <price>
 * Creates a price alert.
 */
export async function alertHandler(ctx: CommandContext<Context>) {
  try {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply(
        "Usage: /alert <item> above/below <price>\n" +
          "Example: /alert Cardboard King above 5.00\n\n" +
          "Types: above, below, change_pct, sales_spike, snipe"
      );
      return;
    }

    // Parse: everything before the type keyword is the item name
    const types = ["above", "below", "change_pct", "sales_spike", "snipe"];
    let itemName = "";
    let alertType = "";
    let threshold = 0;

    for (const t of types) {
      const idx = raw.toLowerCase().lastIndexOf(t);
      if (idx > 0) {
        itemName = raw.slice(0, idx).trim();
        alertType = t;
        const rest = raw.slice(idx + t.length).trim();
        threshold = parseFloat(rest);
        break;
      }
    }

    if (!itemName || !alertType || isNaN(threshold)) {
      await ctx.reply(
        "Could not parse command\\. Format: /alert _item_ above/below _price_",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    const item = await prisma.item.findFirst({
      where: { name: { contains: itemName, mode: "insensitive" } },
    });
    if (!item) {
      await ctx.reply(`Item "${itemName}" not found.`);
      return;
    }

    const userId = String(ctx.from!.id);
    await prisma.alert.create({
      data: {
        itemId: item.id,
        type: alertType,
        threshold,
        userId,
      },
    });

    const cur = await getCurrency();
    await ctx.reply(
      `Alert created: *${esc(item.name)}* ${esc(alertType)} *${esc(money(threshold, cur))}*`,
      { parse_mode: "MarkdownV2", reply_markup: backButton() }
    );
  } catch (err) {
    console.error("alert error:", err);
    await ctx.reply("Failed to create alert. Try again later.");
  }
}

/**
 * /alerts — list active alerts
 */
export async function alertsHandler(ctx: CommandContext<Context>) {
  try {
    const userId = String(ctx.from!.id);
    const alerts = await prisma.alert.findMany({
      where: { active: true, userId },
      include: { item: true },
      orderBy: { createdAt: "desc" },
    });

    if (!alerts.length) {
      await ctx.reply("No active alerts\\. Use /alert to create one\\.", {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    const cur = await getCurrency();
    let text = "🔔 *Active Alerts*\n\n";
    for (const a of alerts) {
      const th = Number(a.threshold);
      text += `\\#${a.id} ${esc(a.item.name)} — ${esc(a.type)} ${esc(money(th, cur))}`;
      if (a.fireCount > 0) text += ` \\(fired ${a.fireCount}x\\)`;
      text += "\n";
    }

    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: backButton() });
  } catch (err) {
    console.error("alerts error:", err);
    await ctx.reply("Failed to load alerts. Try again later.");
  }
}
