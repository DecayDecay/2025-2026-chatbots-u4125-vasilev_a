"use server";
import { prisma } from "@sbox/db";
import { revalidatePath } from "next/cache";

export async function createAlert(formData: FormData) {
  const marketHashName = String(formData.get("marketHashName") ?? "");
  const type = String(formData.get("type") ?? "below");
  const threshold = Number(formData.get("threshold"));
  if (!marketHashName || !threshold) return;
  const item = await prisma.item.findUnique({ where: { marketHashName } });
  if (!item) throw new Error("Item not found");
  await prisma.alert.create({
    data: { itemId: item.id, type, threshold },
  });
  revalidatePath("/alerts");
}

export async function deleteAlert(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.alert.delete({ where: { id } });
  revalidatePath("/alerts");
}

export async function reactivateAlert(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.alert.update({
    where: { id },
    data: { active: true, firedAt: null, firedPrice: null },
  });
  revalidatePath("/alerts");
}
