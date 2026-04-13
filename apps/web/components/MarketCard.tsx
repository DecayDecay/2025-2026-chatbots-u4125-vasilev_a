import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";
import { WatchStar } from "./WatchStar";

// Card-style item used on the grid view (/market?view=grid).
// Glass-morphism + rarity accent stripe + hover glow.
export function MarketCard({
  r,
  watched,
}: {
  r: {
    id: number;
    marketHashName: string;
    name: string;
    type: string | null;
    icon: string | null;
    rarityBg?: string | null;
    rarityFg?: string | null;
    lowestPrice: number | null;
    medianPrice: number | null;
    sales24h: number | null;
    sellListings: number | null;
    change24h: number | null;
    drawdown: number | null;
    dealDiscount: number | null;
    listedValue: number | null;
    volumeUsd24h: number | null;
  };
  watched: boolean;
}) {
  const positive = (r.change24h ?? 0) >= 0;
  return (
    <div
      className="glass glass-hover group relative overflow-hidden p-3"
      style={
        r.rarityBg
          ? { boxShadow: `inset 3px 0 0 0 ${r.rarityBg}` }
          : undefined
      }
    >
      {/* hover glow */}
      <div className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/10 via-transparent to-transparent" />
      </div>

      <div className="absolute right-2 top-2 z-10">
        <WatchStar itemId={r.id} active={watched} />
      </div>

      <Link
        href={`/market/${encodeURIComponent(r.marketHashName)}`}
        className="relative block"
      >
        <div className="flex items-center justify-center rounded-lg bg-gradient-to-b from-neutral-900 to-neutral-950 py-4">
          {r.icon ? (
            <Image
              src={r.icon}
              alt=""
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 object-contain transition-transform duration-300 group-hover:scale-110"
            />
          ) : (
            <div className="h-24 w-24 rounded bg-neutral-800" />
          )}
        </div>

        <div className="mt-3 space-y-1">
          <div
            className="truncate text-sm font-medium"
            style={r.rarityFg ? { color: r.rarityFg } : undefined}
          >
            {r.name}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">
            {r.type}
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-lg tabular-nums">
            {r.medianPrice != null ? formatMoney(r.medianPrice) : "—"}
          </div>
          {r.change24h != null && (
            <div
              className={`text-xs tabular-nums ${
                positive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {positive ? "▲" : "▼"} {Math.abs(r.change24h * 100).toFixed(2)}%
            </div>
          )}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <Stat
            label="sales"
            value={r.sales24h != null ? String(r.sales24h) : "—"}
          />
          <Stat
            label="vol"
            value={
              r.volumeUsd24h != null
                ? `$${formatCompact(r.volumeUsd24h)}`
                : "—"
            }
          />
          <Stat
            label="listed"
            value={
              r.listedValue != null ? `$${formatCompact(r.listedValue)}` : "—"
            }
          />
        </div>

        {r.dealDiscount != null && r.dealDiscount <= -0.05 && (
          <div className="mt-2 rounded border border-emerald-900/50 bg-emerald-950/30 px-2 py-1 text-center text-[10px] font-medium text-emerald-400">
            DEAL {(r.dealDiscount * 100).toFixed(1)}% vs median
          </div>
        )}
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-neutral-900/50 px-1.5 py-1 text-center">
      <div className="text-neutral-600">{label}</div>
      <div className="tabular-nums text-neutral-300">{value}</div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}
