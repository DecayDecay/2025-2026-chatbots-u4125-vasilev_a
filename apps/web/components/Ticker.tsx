import Link from "next/link";
import Image from "next/image";

// Infinite-loop marquee of movers (inspired by sboxcharts top ticker).
// Duplicates the item list so the marquee can translateX(-50%) seamlessly.
export function Ticker({
  items,
}: {
  items: Array<{
    id: number;
    name: string;
    marketHashName: string;
    icon: string | null;
    medianPrice: number | null;
    change24h: number | null;
  }>;
}) {
  if (!items.length) return null;
  const looped = [...items, ...items];
  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-950/60 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-neutral-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-neutral-950 to-transparent" />
      <div className="marquee flex gap-6 whitespace-nowrap py-3">
        {looped.map((it, i) => {
          const positive = (it.change24h ?? 0) >= 0;
          return (
            <Link
              key={`${it.id}-${i}`}
              href={`/market/${encodeURIComponent(it.marketHashName)}`}
              className="flex shrink-0 items-center gap-2 text-sm transition-colors hover:text-orange-400"
            >
              {it.icon && (
                <Image
                  src={it.icon}
                  alt=""
                  width={20}
                  height={20}
                  unoptimized
                  className="h-5 w-5 rounded bg-neutral-800 object-contain"
                />
              )}
              <span className="text-neutral-300">{it.name}</span>
              <span className="tabular-nums text-neutral-500">
                ${it.medianPrice?.toFixed(2) ?? "—"}
              </span>
              <span
                className={`tabular-nums ${
                  positive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {it.change24h != null
                  ? `${positive ? "▲" : "▼"} ${Math.abs(it.change24h * 100).toFixed(2)}%`
                  : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
