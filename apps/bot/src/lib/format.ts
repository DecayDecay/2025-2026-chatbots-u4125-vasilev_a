import { prisma } from "@sbox/db";

// Telegram MarkdownV2 helpers. Special chars must be escaped.
const SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function esc(s: string): string {
  return s.replace(SPECIAL, "\\$1");
}

export function bold(s: string): string {
  return `*${esc(s)}*`;
}

export function code(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

// ── Currency-aware formatters ───────────────────────────────────
// Call getCurrency() once per handler, then pass cur to money/compact.

export type Cur = { code: string; rate: number; sym: string };

const syms: Record<string, string> = { USD: "$", KZT: "₸" };

export async function getCurrency(): Promise<Cur> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const code = s?.currency ?? "USD";
  if (code === "USD") return { code, rate: 1, sym: "$" };
  const fx = await prisma.fxRate.findUnique({ where: { code } });
  const rate = fx ? Number(fx.rate) : 1;
  return { code, rate, sym: syms[code] ?? code };
}

export function money(n: number | null | undefined, cur?: Cur): string {
  if (n == null) return "—";
  const c = cur ?? { code: "USD", rate: 1, sym: "$" };
  const val = n * c.rate;
  const digits = c.code === "KZT" ? 0 : 2;
  return `${c.sym}${val.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

export function compact(n: number, cur?: Cur): string {
  const c = cur ?? { code: "USD", rate: 1, sym: "$" };
  const val = n * c.rate;
  if (val >= 1_000_000) return `${c.sym}${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${c.sym}${(val / 1_000).toFixed(1)}k`;
  return `${c.sym}${val.toFixed(0)}`;
}
