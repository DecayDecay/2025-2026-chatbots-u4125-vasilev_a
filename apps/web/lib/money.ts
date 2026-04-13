import { prisma } from "@sbox/db";

export type CurrencyCode = "USD" | "KZT" | string;

const symbols: Record<string, string> = {
  USD: "$",
  KZT: "₸",
  EUR: "€",
};

// Steam fee that sellers pay (10% Steam + ~3% game).
export const SELLER_KEEP = 0.87;

// ── Formatting ──────────────────────────────────────────────────

export function formatMoney(amount: number, code: CurrencyCode = "USD") {
  const sym = symbols[code] ?? "";
  const digits = code === "KZT" ? 0 : 2;
  return `${sym}${amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

// Format USD amount in the user's chosen currency.
// `rate` is pre-fetched to avoid N+1 queries per row.
export function formatInCurrency(
  usdAmount: number,
  currency: CurrencyCode,
  rate: number
) {
  const converted = currency === "USD" ? usdAmount : usdAmount * rate;
  return formatMoney(converted, currency);
}

// ── Rate helpers ────────────────────────────────────────────────

export async function getRate(code: CurrencyCode): Promise<number> {
  if (code === "USD") return 1;
  const row = await prisma.fxRate.findUnique({ where: { code } });
  return row ? Number(row.rate) : 1;
}

// ── Settings ────────────────────────────────────────────────────

export async function getUserCurrency(): Promise<{
  code: CurrencyCode;
  rate: number;
  symbol: string;
}> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const code = (settings?.currency ?? "USD") as CurrencyCode;
  const rate = await getRate(code);
  return { code, rate, symbol: symbols[code] ?? code };
}

export async function setUserCurrency(code: CurrencyCode): Promise<void> {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, currency: code },
    update: { currency: code },
  });
}

// ── FX rate update ──────────────────────────────────────────────

// Fetch fresh USD/KZT rate from a free API.
export async function refreshKztRate(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KZT"
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { KZT?: number } };
    const rate = data.rates?.KZT;
    if (!rate) throw new Error("No KZT rate in response");
    await prisma.fxRate.upsert({
      where: { code: "KZT" },
      create: { code: "KZT", rate },
      update: { rate, ts: new Date() },
    });
    return rate;
  } catch {
    // Frankfurter doesn't support KZT, use fallback
    // Try exchangerate.host as backup
    try {
      const res2 = await fetch(
        "https://open.er-api.com/v6/latest/USD"
      );
      const data2 = (await res2.json()) as { rates?: { KZT?: number } };
      const rate2 = data2.rates?.KZT;
      if (rate2) {
        await prisma.fxRate.upsert({
          where: { code: "KZT" },
          create: { code: "KZT", rate: rate2 },
          update: { rate: rate2, ts: new Date() },
        });
        return rate2;
      }
    } catch {}
    // Return stored rate as last resort
    const stored = await prisma.fxRate.findUnique({ where: { code: "KZT" } });
    return stored ? Number(stored.rate) : 510;
  }
}
