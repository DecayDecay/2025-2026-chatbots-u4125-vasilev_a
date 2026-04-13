import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";

export async function settingsHandler(ctx: CommandContext<Context>) {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const cur = s?.currency ?? "USD";
  const fx = await prisma.fxRate.findUnique({ where: { code: "KZT" } });
  const rate = fx ? Number(fx.rate).toFixed(2) : "—";

  const kb = new InlineKeyboard()
    .text(cur === "USD" ? "✅ $ USD" : "$ USD", "setcur:USD")
    .text(cur === "KZT" ? "✅ ₸ KZT" : "₸ KZT", "setcur:KZT")
    .row()
    .text("← Меню", "menu:back");

  await ctx.reply(
    `⚙️ *Настройки*\n\n` +
      `Валюта: *${esc(cur)}* ${cur === "KZT" ? `\\(1 USD \\= ₸${esc(rate)}\\)` : ""}\n\n` +
      `Выберите валюту отображения:`,
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
}

function esc(s: string) {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
