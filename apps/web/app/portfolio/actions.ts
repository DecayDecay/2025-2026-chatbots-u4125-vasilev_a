"use server";
import { prisma } from "@sbox/db";
import { revalidatePath } from "next/cache";

export async function addPosition(formData: FormData) {
  const marketHashName = String(formData.get("marketHashName") ?? "");
  const qty = Number(formData.get("qty"));
  const buyPrice = Number(formData.get("buyPrice"));
  const buyDate = new Date(String(formData.get("buyDate")));
  if (!marketHashName || !qty || !buyPrice) return;

  const item = await prisma.item.findUnique({ where: { marketHashName } });
  if (!item) throw new Error("Item not found — run catalog scraper first");

  await prisma.position.create({
    data: { itemId: item.id, qty, buyPrice, buyDate },
  });
  revalidatePath("/portfolio");
}

export async function sellPosition(formData: FormData) {
  const id = Number(formData.get("id"));
  const sellPrice = Number(formData.get("sellPrice"));
  if (!id || !sellPrice) return;
  await prisma.position.update({
    where: { id },
    data: { sellPrice, sellDate: new Date() },
  });
  revalidatePath("/portfolio");
}

export async function deletePosition(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.position.delete({ where: { id } });
  revalidatePath("/portfolio");
}

// Import a public Steam inventory by SteamID64. Anonymous, no auth.
// Each unique market_hash_name becomes a Position with qty = stack count.
// Buy price defaults to current median (we don't know what the user paid).
export async function importInventory(formData: FormData) {
  const steamId = String(formData.get("steamId") ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    throw new Error("Provide a valid SteamID64 (17 digits)");
  }
  const url = `https://steamcommunity.com/inventory/${steamId}/590830/2?l=english&count=5000`;
  const res = await fetch(url, {
    headers: { "user-agent": "sbox-terminal/0.1" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Steam returned ${res.status}`);
  const data = (await res.json()) as {
    assets?: Array<{ classid: string; instanceid: string }>;
    descriptions?: Array<{
      classid: string;
      instanceid: string;
      market_hash_name: string;
    }>;
  };
  if (!data.assets || !data.descriptions) {
    throw new Error("Inventory is empty or private");
  }
  // Map classid+instanceid → hash_name, then count assets per hash.
  const hashByKey = new Map<string, string>();
  for (const d of data.descriptions) {
    hashByKey.set(`${d.classid}:${d.instanceid}`, d.market_hash_name);
  }
  const counts = new Map<string, number>();
  for (const a of data.assets) {
    const hash = hashByKey.get(`${a.classid}:${a.instanceid}`);
    if (hash) counts.set(hash, (counts.get(hash) ?? 0) + 1);
  }
  if (!counts.size) throw new Error("No s&box items found in inventory");

  // Lookup each item; pull current median as a sane default buy price.
  const items = await prisma.item.findMany({
    where: { marketHashName: { in: [...counts.keys()] } },
    select: { id: true, marketHashName: true },
  });
  const idByHash = new Map(items.map((i) => [i.marketHashName, i.id]));

  // Latest median for default buy price.
  const ids = items.map((i) => i.id);
  const snaps = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ON ("itemId") "itemId", "medianPrice", "lowestPrice"
     FROM "PriceSnapshot" WHERE "itemId" = ANY($1::int[])
     ORDER BY "itemId", "ts" DESC`,
    ids
  )) as Array<{ itemId: number; medianPrice: unknown; lowestPrice: unknown }>;
  const priceById = new Map(
    snaps.map((s) => [
      s.itemId,
      Number(s.medianPrice ?? s.lowestPrice ?? 0) || 0,
    ])
  );

  let inserted = 0;
  for (const [hash, qty] of counts.entries()) {
    const itemId = idByHash.get(hash);
    if (!itemId) continue;
    await prisma.position.create({
      data: {
        itemId,
        qty,
        buyPrice: priceById.get(itemId) ?? 0,
        buyDate: new Date(),
        note: "imported",
      },
    });
    inserted++;
  }
  revalidatePath("/portfolio");
  return { inserted };
}
