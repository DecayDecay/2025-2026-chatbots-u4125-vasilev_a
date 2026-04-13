"use server";
import { setUserCurrency, refreshKztRate } from "@/lib/money";
import { revalidatePath } from "next/cache";

export async function switchCurrency(formData: FormData) {
  const code = String(formData.get("currency") ?? "USD");
  if (code === "KZT") {
    // Refresh rate before switching
    await refreshKztRate();
  }
  await setUserCurrency(code);
  // Revalidate all pages so they pick up the new currency
  revalidatePath("/");
  revalidatePath("/market");
  revalidatePath("/portfolio");
  revalidatePath("/settings");
}
