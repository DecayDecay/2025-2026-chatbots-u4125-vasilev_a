import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getItemDetail, getSimilarItems } from "@/lib/queries";
import { formatInCurrency, getUserCurrency } from "@/lib/money";
import { PriceChart } from "@/components/PriceChart";
import { OrderBookDepth } from "@/components/OrderBookDepth";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: { hash: string };
  searchParams: { tf?: string };
}) {
  const { hash } = params;
  const data = await getItemDetail(decodeURIComponent(hash));
  if (!data) notFound();
  const { item, latest, history, snapshots, orderbook } = data;
  const similar = await getSimilarItems(item.id, item.type);
  const cur = await getUserCurrency();
  const fmt = (n: number) => formatInCurrency(n, cur.code, cur.rate);

  // Pick which series to chart: PriceHistory if we have it, else live snapshots.
  const usingHistory = history.length > 0;
  const tf = searchParams.tf ?? (usingHistory ? "30d" : "all");
  const tfMap: Record<string, number> = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "1y": 365,
    all: Infinity,
  };
  const days = tfMap[tf] ?? 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const series = usingHistory
    ? history
        .filter((h) => new Date(h.day).getTime() >= cutoff)
        .map((h) => ({ ts: h.day, price: h.price, volume: h.volume }))
    : snapshots
        .filter((s) => s.price != null && new Date(s.ts).getTime() >= cutoff)
        .map((s) => ({
          ts: s.ts,
          price: s.price as number,
          volume: s.volume ?? 0,
        }));

  const prices = series.map((s) => s.price);
  const ath = prices.length ? Math.max(...prices) : null;
  const atl = prices.length ? Math.min(...prices) : null;
  const drawdown = ath && prices.at(-1) ? (prices.at(-1)! - ath) / ath : null;
  const avgVol =
    series.length > 0
      ? series.reduce((a, b) => a + b.volume, 0) / series.length
      : null;

  // Volatility = stdev of pct returns.
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev) returns.push((prices[i] - prev) / prev);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length || 1);
  const volatility = Math.sqrt(variance);

  const medianNow = latest
    ? Number(latest.medianPrice ?? latest.lowestPrice ?? 0) || null
    : null;
  // Steam fee aware sell helper.
  const breakEven = medianNow ? medianNow / 0.87 : null;

  const tfs = ["1d", "7d", "30d", "1y", "all"];

  return (
    <div className="space-y-6">
      <header className="glass flex items-start gap-5 p-5">
        {item.icon && (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-neutral-900 to-neutral-950">
            <Image
              src={item.icon}
              alt=""
              width={112}
              height={112}
              unoptimized
              className="h-24 w-24 object-contain"
            />
          </div>
        )}
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">
            {item.type}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {item.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
            <span>
              tracked since{" "}
              {new Date(item.firstSeenAt).toLocaleDateString()}
            </span>
            <span>·</span>
            <a
              className="text-orange-400 hover:underline"
              href={`https://steamcommunity.com/market/listings/590830/${encodeURIComponent(
                item.marketHashName
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on Steam ↗
            </a>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat
          label="Median"
          value={medianNow != null ? fmt(medianNow) : "—"}
        />
        <Stat
          label="Lowest"
          value={
            latest?.lowestPrice != null
              ? fmt(Number(latest.lowestPrice))
              : "—"
          }
        />
        <Stat label="ATH" value={ath != null ? fmt(ath) : "—"} />
        <Stat label="ATL" value={atl != null ? fmt(atl) : "—"} />
        <Stat
          label="Drawdown"
          value={
            drawdown != null ? `${(drawdown * 100).toFixed(1)}%` : "—"
          }
          color={drawdown != null && drawdown < 0 ? "rose" : undefined}
        />
        <Stat
          label="Volatility"
          value={returns.length ? `${(volatility * 100).toFixed(2)}%` : "—"}
        />
      </div>

      <section className="glass p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-300">
            Price history{" "}
            <span className="text-xs text-neutral-500">
              ({series.length} points · {usingHistory ? "daily" : "intraday snapshots"})
            </span>
          </h2>
          <div className="flex gap-1 text-xs">
            {tfs.map((t) => (
              <a
                key={t}
                href={`?tf=${t}`}
                className={`rounded px-2 py-1 ${
                  tf === t
                    ? "bg-orange-500 text-black"
                    : "bg-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                {t}
              </a>
            ))}
          </div>
        </div>
        {series.length > 1 ? (
          <PriceChart
            showVolume={usingHistory}
            data={series.map((s) => ({
              ts: s.ts,
              price: s.price,
              volume: s.volume,
            }))}
          />
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500">
            Not enough data yet. The scraper is collecting snapshots — Δ24h
            and charts will populate as snapshots accumulate.
          </div>
        )}
      </section>

      {orderbook && (
        <section className="glass p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">
            Order book
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat
              label="Top buy"
              value={
                orderbook.buyTop ? fmt(Number(orderbook.buyTop)) : "—"
              }
            />
            <Stat
              label="Top sell"
              value={
                orderbook.sellTop
                  ? fmt(Number(orderbook.sellTop))
                  : "—"
              }
            />
            <Stat
              label="Spread"
              value={
                orderbook.spreadPct
                  ? `${Number(orderbook.spreadPct).toFixed(2)}%`
                  : "—"
              }
            />
            <Stat
              label="Liquidity"
              value={
                orderbook.liquidityScore
                  ? fmt(Number(orderbook.liquidityScore))
                  : "—"
              }
              hint="min(buy wall, sell wall)"
            />
            <Stat
              label="Break-even sell"
              value={breakEven ? fmt(breakEven) : "—"}
              hint="incl. 13% Steam fee"
            />
          </div>
          <OrderBookDepth
            buyWalls={(orderbook.buyWalls as Array<[number, number]>) ?? []}
            sellWalls={(orderbook.sellWalls as Array<[number, number]>) ?? []}
          />
        </section>
      )}

      <section className="glass p-4 text-xs text-neutral-500">
        Avg sales/day: {avgVol != null ? avgVol.toFixed(0) : "—"}
      </section>

      {similar.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-300">
            Similar items
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`/market/${encodeURIComponent(s.marketHashName)}`}
                className="glass glass-hover group p-3 text-center"
              >
                {s.icon && (
                  <Image
                    src={s.icon}
                    alt=""
                    width={80}
                    height={80}
                    unoptimized
                    className="mx-auto h-20 w-20 object-contain transition-transform duration-300 group-hover:scale-110"
                  />
                )}
                <div className="mt-2 truncate text-xs">{s.name}</div>
                <div className="text-[11px] tabular-nums text-orange-400">
                  {fmt(s.price)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: "rose" | "emerald";
}) {
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-gradient-to-b from-neutral-900/50 to-neutral-950/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg tabular-nums ${
          color === "rose"
            ? "text-rose-400"
            : color === "emerald"
              ? "text-emerald-400"
              : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-neutral-600">{hint}</div>}
    </div>
  );
}
