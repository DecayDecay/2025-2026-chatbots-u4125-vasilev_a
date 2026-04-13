"use server";
import { prisma } from "@sbox/db";
import { revalidatePath } from "next/cache";

export async function toggleWatchlist(formData: FormData) {
  const itemId = Number(formData.get("itemId"));
  if (!itemId) return;
  const existing = await prisma.watchlist.findUnique({ where: { itemId } });
  if (existing) {
    await prisma.watchlist.delete({ where: { itemId } });
  } else {
    await prisma.watchlist.create({ data: { itemId } });
  }
  revalidatePath("/market");
  revalidatePath("/");
}
