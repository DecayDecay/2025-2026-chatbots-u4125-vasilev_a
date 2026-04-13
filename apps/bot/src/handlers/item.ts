import type { CommandContext, Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { prisma } from "@sbox/db";
import https from "https";
import { money, pct, compact, getCurrency } from "../lib/format.js";

const STEAM_CDN = "https://community.akamai.steamstatic.com/economy/image/";

function fetchImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

export async function itemHandler(ctx: CommandContext<Context>) {
  const name = ctx.match?.trim();
  if (!name) {
    await ctx.reply("Usage: /item <item name>\nExample: /item Cardboard King");
    return;
  }

  const item = await prisma.item.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
  });
  if (!item) {
    await ctx.reply(`Item "${name}" not found. Try /market to see all items.`);
    return;
  }

  // Latest snapshot
  const snap = await prisma.priceSnapshot.findFirst({
    where: { itemId: item.id },
    orderBy: { ts: "desc" },
  });

  // Prior snapshot for Δ
  const snaps = await prisma.priceSnapshot.findMany({
    where: { itemId: item.id, medianPrice: { not: null } },
    orderBy: { ts: "desc" },
    take: 2,
    select: { medianPrice: true },
  });
  const cur = Number(snap?.medianPrice ?? snap?.lowestPrice ?? 0);
  const prev = snaps[1] ? Number(snaps[1].medianPrice) : null;
  const delta = prev && prev > 0 ? (cur - prev) / prev : null;

  // ATH from snapshots
  const ath = await prisma.$queryRawUnsafe(
    `SELECT MAX(GREATEST(COALESCE("medianPrice",0), COALESCE("lowestPrice",0)))::float AS ath
     FROM "PriceSnapshot" WHERE "itemId" = $1`,
    item.id
  ) as Array<{ ath: number }>;
  const athVal = ath[0]?.ath ?? null;
  const drawdown = athVal && cur > 0 ? (cur - athVal) / athVal : null;

  // Order book
  const ob = await prisma.orderBook.findFirst({
    where: { itemId: item.id },
    orderBy: { ts: "desc" },
  });

  // sbox.game stats
  const sboxAll = await prisma.sboxGameStat.findUnique({
    where: { itemId_timeframe: { itemId: item.id, timeframe: "all" } },
  });
  const sbox30d = await prisma.sboxGameStat.findUnique({
    where: { itemId_timeframe: { itemId: item.id, timeframe: "30d" } },
  });

  const stock = sboxAll?.units ?? null;
  const lifetimeRev = sboxAll ? Number(sboxAll.usdRevenue) : null;
  const avgSale = stock && lifetimeRev ? lifetimeRev / stock : null;
  const rev30d = sbox30d ? Number(sbox30d.usdRevenue) : null;
  const momentum = lifetimeRev && rev30d ? rev30d / lifetimeRev : null;
  const c = await getCurrency();
  const breakEven = cur > 0 ? cur / 0.87 : null;

  let text = `🏷 *${esc(item.name)}*\n`;
  text += `${esc(item.type ?? "—")}\n\n`;
  text += `💰 Median: *${esc(money(cur, c))}*`;
  if (delta != null) text += ` \\(${esc(pct(delta))}\\)`;
  text += "\n";
  text += `📉 Lowest: ${esc(money(Number(snap?.lowestPrice ?? 0), c))}\n`;
  text += `📊 ATH: ${esc(money(athVal, c))} \\| Drawdown: ${esc(drawdown != null ? pct(drawdown) : "—")}\n`;
  text += `📈 Vol 24h: ${esc(String(snap?.volume24h ?? "—"))}\n\n`;

  if (ob) {
    text += `*Order Book*\n`;
    text += `Buy: ${esc(money(Number(ob.buyTop), c))} \\| Sell: ${esc(money(Number(ob.sellTop), c))}\n`;
    text += `Spread: ${esc(Number(ob.spreadPct).toFixed(2))}% \\| Liquidity: ${esc(compact(Number(ob.liquidityScore), c))}\n\n`;
  }

  if (stock != null) {
    text += `*sbox\\.game*\n`;
    text += `Stock: ${esc(stock.toLocaleString())} units\n`;
    text += `Lifetime: ${esc(compact(lifetimeRev ?? 0, c))} \\| Avg: ${esc(money(avgSale, c))}\n`;
    if (momentum != null)
      text += `Momentum 30d: ${esc((momentum * 100).toFixed(0))}%\n`;
  }

  if (breakEven) {
    text += `\n💡 Break\\-even sell: ${esc(money(breakEven, c))} \\(incl 13% fee\\)`;
  }

  const kb = new InlineKeyboard()
    .text("⭐ Watch", `watch:${item.id}`)
    .text("🔔 Alert", `alertprompt:${item.id}`)
    .text("📈 Chart", `chart:${item.id}`)
    .row()
    .text("🛒 Buy", `buyprompt:${item.id}`)
    .url("Steam ↗", `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(item.marketHashName)}`)
    .row()
    .text("← Меню", "menu:back");

  // Send with item icon if available.
  if (item.iconUrl) {
    try {
      const imgUrl = `${STEAM_CDN}${item.iconUrl}/256fx256f`;
      const buf = await fetchImage(imgUrl);
      await ctx.replyWithPhoto(new InputFile(buf, `${item.id}.png`), {
        caption: text,
        parse_mode: "MarkdownV2",
        reply_markup: kb,
      });
      return;
    } catch {
      // Fallback to text-only.
    }
  }
  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
}

function esc(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
