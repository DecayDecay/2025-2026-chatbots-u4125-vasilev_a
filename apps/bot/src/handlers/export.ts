import type { CommandContext, Context } from "grammy";
import { InputFile } from "grammy";
import { prisma } from "@sbox/db";
import { backButton } from "../lib/keyboard.js";

export async function exportHandler(ctx: CommandContext<Context>) {
  try {
    const positions = await prisma.position.findMany({
      include: { item: true },
      orderBy: { buyDate: "desc" },
    });

    if (!positions.length) {
      await ctx.reply("No positions to export. Use /buy to add some first.");
      return;
    }

    const header = "id,item,qty,buyPrice,buyDate,sellPrice,sellDate,status";
    const rows = positions.map((p) => {
      const sell = p.sellPrice ? Number(p.sellPrice).toFixed(2) : "";
      const sellDate = p.sellDate ? p.sellDate.toISOString().slice(0, 10) : "";
      const status = p.sellPrice ? "closed" : "open";
      return [
        p.id,
        `"${p.item.name}"`,
        p.qty,
        Number(p.buyPrice).toFixed(2),
        p.buyDate.toISOString().slice(0, 10),
        sell,
        sellDate,
        status,
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const buf = Buffer.from(csv, "utf-8");

    await ctx.replyWithDocument(
      new InputFile(buf, `portfolio_${Date.now()}.csv`)
    );
    await ctx.reply("Файл экспортирован.", { reply_markup: backButton() });
  } catch (err) {
    console.error("export error:", err);
    await ctx.reply("Failed to export portfolio. Try again later.");
  }
}
