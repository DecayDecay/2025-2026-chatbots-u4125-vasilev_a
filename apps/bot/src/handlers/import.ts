import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@sbox/db";
import https from "https";
import { money, getCurrency } from "../lib/format.js";
import { backButton } from "../lib/keyboard.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function httpGet(
  url: string,
  headers?: Record<string, string>
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "user-agent": UA, ...headers } }, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data }));
      })
      .on("error", reject);
  });
}

async function resolveSteamId(input: string): Promise<string | null> {
  let id = input
    .replace(/https?:\/\/steamcommunity\.com\/(id|profiles)\//, "")
    .replace(/\/.*$/, "")
    .trim();
  if (/^\d{17}$/.test(id)) return id;
  try {
    const { data: xml } = await httpGet(
      `https://steamcommunity.com/id/${encodeURIComponent(id)}/?xml=1`
    );
    const match = xml.match(/<steamID64>(\d+)<\/steamID64>/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

interface SteamInvResponse {
  total_inventory_count?: number;
  assets?: Array<{ classid: string; instanceid: string; amount?: string }>;
  descriptions?: Array<{
    classid: string;
    instanceid: string;
    market_hash_name: string;
  }>;
}

// Map to track users waiting to paste JSON after /import failed or chose manual.
export const pendingPaste = new Map<number, string>(); // chatId → steamId

// Buffer for multi-message JSON paste. Telegram splits long messages ~4096 chars.
// We accumulate chunks until we can parse valid JSON or timeout.
export const pasteBuffer = new Map<number, { chunks: string[]; timer: ReturnType<typeof setTimeout> }>();

export function appendPasteChunk(chatId: number, text: string): string | null {
  let buf = pasteBuffer.get(chatId);
  if (!buf) {
    buf = {
      chunks: [],
      timer: setTimeout(() => {
        pasteBuffer.delete(chatId);
      }, 10_000), // 10s timeout to collect all chunks
    };
    pasteBuffer.set(chatId, buf);
  }
  buf.chunks.push(text);
  clearTimeout(buf.timer);

  const combined = buf.chunks.join("");

  // Try to parse — if valid JSON, return it.
  try {
    JSON.parse(combined);
    pasteBuffer.delete(chatId);
    return combined;
  } catch {
    // Not valid yet — set new timer to wait for more chunks.
    buf.timer = setTimeout(() => {
      pasteBuffer.delete(chatId);
    }, 3_000); // 3s after last chunk
    return null;
  }
}

// /import — tries auto-fetch first, falls back to manual console method.
export async function importHandler(ctx: CommandContext<Context>) {
  const userId = String(ctx.from!.id);
  const input = ctx.match?.trim();
  if (!input) {
    await ctx.reply(
      "📦 *Импорт инвентаря Steam*\n\n" +
        "Отправьте ссылку или SteamID:\n\n" +
        "`/import DikiiDecay`\n" +
        "`/import 76561198066344484`\n" +
        "`/import https://steamcommunity\\.com/id/DikiiDecay/`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  const msg = await ctx.reply("🔍 Ищу профиль...");

  try {
    const steamId = await resolveSteamId(input);
    if (!steamId) {
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        "❌ Не удалось найти профиль\\. Проверьте ссылку\\.",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    console.log(`[import] trying auto-fetch for ${steamId}`);

    // Try auto-fetch (works for public inventories when not rate-limited).
    const { status, data: raw } = await httpGet(
      `https://steamcommunity.com/inventory/${steamId}/590830/2?l=english&count=5000`,
      {
        referer: `https://steamcommunity.com/profiles/${steamId}/inventory/`,
        accept: "application/json",
      }
    );
    console.log(`[import] steam responded ${status}`);

    if (status === 200) {
      // Auto-fetch worked — process directly.
      let data: SteamInvResponse;
      try {
        data = JSON.parse(raw);
      } catch {
        await sendManualMethod(ctx, msg, steamId);
        return;
      }
      if (!data.assets || !data.descriptions) {
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          "📭 У игрока нет предметов s\\&box\\.",
          { parse_mode: "MarkdownV2" }
        );
        return;
      }
      await processInventory(ctx, msg, steamId, data, userId);
      return;
    }

    // Auto-fetch failed → offer manual method.
    await sendManualMethod(ctx, msg, steamId);
  } catch (err) {
    console.error("import error:", err);
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      "❌ Ошибка\\. Попробуйте ручной метод: /paste",
      { parse_mode: "MarkdownV2" }
    );
  }
}

// Send instructions for the browser console method.
async function sendManualMethod(
  ctx: any,
  msg: { chat: { id: number }; message_id: number },
  steamId: string
) {
  pendingPaste.set(msg.chat.id, steamId);

  const cmd = `fetch("/inventory/${steamId}/590830/2?l=english&count=75").then(r=>r.text()).then(t=>{var w=window.open();w.document.write("<textarea style='width:100%;height:100vh'>"+t.replace(/</g,"&lt;")+"</textarea>");w.document.title="Ctrl+A, Ctrl+C"})`;

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `⚠️ Steam заблокировал автозагрузку\\.\n\n` +
      `*Ручной метод \\(30 сек\\):*\n\n` +
      `1️⃣ Откройте инвентарь в браузере:\nhttps://steamcommunity\\.com/profiles/${steamId}/inventory/\\#590830\n\n` +
      `2️⃣ F12 → Console → вставьте команду:\n\n` +
      `3️⃣ Откроется окно с текстом → Ctrl\\+A → Ctrl\\+C\n\n` +
      `4️⃣ Вернитесь сюда и вставьте \\(Ctrl\\+V\\)`,
    { parse_mode: "MarkdownV2" }
  );

  // Send the command as a separate copyable message (no MarkdownV2 escaping).
  await ctx.reply(cmd);
}

// Process parsed inventory data and create positions.
async function processInventory(
  ctx: any,
  msg: { chat: { id: number }; message_id: number },
  steamId: string,
  data: SteamInvResponse,
  userId: string
) {
  const hashByKey = new Map<string, string>();
  for (const d of data.descriptions!) {
    hashByKey.set(`${d.classid}:${d.instanceid}`, d.market_hash_name);
  }
  const counts = new Map<string, number>();
  for (const a of data.assets!) {
    const hash = hashByKey.get(`${a.classid}:${a.instanceid}`);
    if (hash) counts.set(hash, (counts.get(hash) ?? 0) + 1);
  }

  const items = await prisma.item.findMany({
    where: { marketHashName: { in: [...counts.keys()] } },
    select: { id: true, name: true, marketHashName: true },
  });
  const idByHash = new Map(items.map((i) => [i.marketHashName, i]));
  const ids = items.map((i) => i.id);
  const snaps = ids.length
    ? ((await prisma.$queryRawUnsafe(
        `SELECT DISTINCT ON ("itemId") "itemId", "medianPrice"::float
         FROM "PriceSnapshot" WHERE "itemId" = ANY($1::int[])
         ORDER BY "itemId", "ts" DESC`,
        ids
      )) as Array<{ itemId: number; medianPrice: number }>)
    : [];
  const priceById = new Map(snaps.map((s) => [s.itemId, s.medianPrice ?? 0]));

  const cur = await getCurrency();
  let added = 0;
  let text = `📦 *Инвентарь загружен*\n\n`;

  let skipped = 0;
  for (const [hash, qty] of counts.entries()) {
    const item = idByHash.get(hash);
    if (!item) continue;
    // Deduplication: skip if user already has an open position for this item
    const existing = await prisma.position.findFirst({
      where: { userId, itemId: item.id, sellPrice: null },
    });
    if (existing) { skipped++; continue; }
    const price = priceById.get(item.id) ?? 0;
    await prisma.position.create({
      data: {
        itemId: item.id,
        qty,
        buyPrice: price,
        buyDate: new Date(),
        note: `import:${steamId}`,
        userId,
      },
    });
    text += `• ${esc(item.name)} ×${qty} @ ${esc(money(price, cur))}\n`;
    added++;
  }

  const unmatched = counts.size - added - skipped;
  text += `\n✅ Добавлено: ${added} позиций`;
  if (skipped > 0) text += `\n♻️ Пропущено \\(дубли\\): ${skipped}`;
  if (unmatched > 0) text += `\n⚠️ Не найдено в каталоге: ${unmatched}`;
  text += `\n\n/portfolio — посмотреть портфолио`;

  await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
    parse_mode: "MarkdownV2",
    reply_markup: backButton(),
  });
}

// Exported for use in index.ts — handles pasted JSON from manual method.
export async function handlePastedJson(
  ctx: any,
  chatId: number,
  text: string
) {
  const userId = String(ctx.from!.id);
  const steamId = pendingPaste.get(chatId) ?? "manual";
  pendingPaste.delete(chatId);

  try {
    const data = JSON.parse(text) as SteamInvResponse;
    if (!data.assets || !data.descriptions) {
      await ctx.reply("📭 JSON не содержит предметов s\\&box\\.", {
        parse_mode: "MarkdownV2",
      });
      return true;
    }
    const msg = await ctx.reply("📦 Обрабатываю инвентарь...");
    await processInventory(ctx, msg, steamId, data, userId);
    return true;
  } catch {
    await ctx.reply(
      "❌ Не удалось распарсить\\. Убедитесь что вставили весь JSON\\.",
      { parse_mode: "MarkdownV2" }
    );
    return true;
  }
}

function esc(s: string) {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
