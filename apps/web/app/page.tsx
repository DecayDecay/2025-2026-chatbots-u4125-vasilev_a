import Link from "next/link";
import Image from "next/image";
import { prisma } from "@sbox/db";
import {
  getMarketRows,
  getMarketOverview,
  getSboxGameOverview,
} from "@/lib/queries";
import { formatInCurrency, getUserCurrency } from "@/lib/money";
import { LiveBadge } from "@/components/LiveBadge";
import { QuickRefresh } from "@/components/QuickRefresh";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const cur = await getUserCurrency();
  const fmt = (n: number) => formatInCurrency(n, cur.code, cur.rate);
  const [rows, overview, sbox, lastRun] = await Promise.all([
    getMarketRows({ sort: "volume" }),
    getMarketOverview(),
    getSboxGameOverview(),
    prisma.scrapeRun.findFirst({
      where: { ok: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const gainers = [...rows]
    .filter((r) => r.change24h != null)
    .sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0))
    .slice(0, 4);
  const losers = [...rows]
    .filter((r) => r.change24h != null)
    .sort((a, b) => (a.change24h ?? 0) - (b.change24h ?? 0))
    .slice(0, 4);

  return (
    <div className="space-y-8">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-neutral-800/60">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <Image
            src="/hero.png"
            alt=""
            fill
            className="object-cover object-center"
            unoptimized
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/95 via-neutral-950/80 to-neutral-950/40" />
        </div>

        <div className="relative z-10 px-8 py-10">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                s&box
                <span className="text-orange-400"> Terminal</span>
              </h1>
              <p className="mt-2 max-w-md text-sm text-neutral-400">
                Steam Market tracker for s&box skins. Prices, order book,
                stock data, portfolio & alerts.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <QuickRefresh />
              <LiveBadge lastTs={overview.lastTs} ok={!!lastRun?.ok} />
            </div>
          </div>

          {/* 3 key numbers */}
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-xl">
            <HeroStat
              label="Market Cap"
              value={fmt(overview.marketCap)}
            />
            <HeroStat
              label="Volume 24h"
              value={fmt(overview.volumeUsd24h)}
            />
            <HeroStat label="Items" value={String(overview.itemCount)} />
          </div>
        </div>
      </section>

      {/* ── Facepunch metrics ────────────────────────────────── */}
      <section className="glass p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-neutral-200">
              Facepunch revenue
            </h2>
            <p className="text-[11px] text-neutral-500">
              official data from{" "}
              <a
                href="https://sbox.game/metrics/skins"
                target="_blank"
                rel="noreferrer"
                className="text-orange-400 hover:underline"
              >
                sbox.game
              </a>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FpCard
            label="Lifetime"
            value={fmt(sbox.all.rev)}
            sub={`${sbox.all.units.toLocaleString()} units`}
          />
          <FpCard
            label="30 days"
            value={fmt(sbox.d30.rev)}
            sub={`${sbox.d30.units.toLocaleString()} units`}
          />
          <FpCard
            label="7 days"
            value={fmt(sbox.d7.rev)}
            sub={`${sbox.d7.units.toLocaleString()} units`}
          />
          <FpCard
            label="Today"
            value={fmt(sbox.d1.rev)}
            sub={`${sbox.d1.units.toLocaleString()} units`}
          />
        </div>
        {/* Top earners strip */}
        <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
          {sbox.topEarners.map((t) => (
            <Link
              key={t.id}
              href={`/market/${encodeURIComponent(t.marketHashName)}`}
              className="group flex items-center gap-2 rounded-lg border border-neutral-800/50 bg-neutral-900/30 p-2 transition-all hover:border-orange-500/40 hover:bg-neutral-900/60"
            >
              {t.icon && (
                <Image
                  src={t.icon}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  className="h-7 w-7 rounded bg-neutral-800 object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-neutral-300 group-hover:text-white">
                  {t.name}
                </div>
                <div className="text-[10px] tabular-nums text-orange-400/80">
                  {fmt(t.lifetimeRev)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Movers ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MoversCard title="Gainers 24h" items={gainers} dir="up" />
        <MoversCard title="Losers 24h" items={losers} dir="down" />
      </div>

      {/* ── Full table ───────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-300">
            All items
          </h2>
          <Link
            href="/market"
            className="text-xs text-orange-400 hover:underline"
          >
            full market →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-800/60 bg-neutral-950/40 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-[11px] uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Item</th>
                <th className="px-3 py-2.5 text-right">Median</th>
                <th className="px-3 py-2.5 text-right">Sales 24h</th>
                <th className="px-3 py-2.5 text-right">Vol $ 24h</th>
                <th className="px-3 py-2.5 text-right">Δ 24h</th>
                <th className="px-3 py-2.5 text-right">Listed</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-neutral-900/60 transition-colors hover:bg-neutral-900/30"
                  style={
                    r.rarityBg
                      ? { boxShadow: `inset 3px 0 0 0 ${r.rarityBg}` }
                      : undefined
                  }
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/market/${encodeURIComponent(r.marketHashName)}`}
                      className="flex items-center gap-2 hover:text-orange-400"
                    >
                      {r.icon ? (
                        <Image
                          src={r.icon}
                          alt=""
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 rounded bg-neutral-800 object-contain"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded bg-neutral-800" />
                      )}
                      <div>
                        <div className="truncate text-[13px] leading-tight">
                          {r.name}
                        </div>
                        <div className="text-[10px] text-neutral-600">
                          {r.type}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.medianPrice != null ? fmt(r.medianPrice) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.sales24h ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                    {r.volumeUsd24h != null
                      ? fmt(r.volumeUsd24h)
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.change24h == null
                        ? "text-neutral-600"
                        : r.change24h >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    }`}
                  >
                    {r.change24h == null
                      ? "—"
                      : `${r.change24h >= 0 ? "+" : ""}${(r.change24h * 100).toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                    {r.listedValue != null ? fmt(r.listedValue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 15 && (
            <div className="border-t border-neutral-900/60 px-3 py-3 text-center">
              <Link
                href="/market"
                className="text-xs text-neutral-400 hover:text-orange-400"
              >
                show all {rows.length} items →
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Components ──────────────────────────────────────────────── */

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FpCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800/60 bg-gradient-to-br from-orange-950/15 to-neutral-950/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-orange-400/60">
        {label}
      </div>
      <div className="mt-0.5 text-lg tabular-nums">{value}</div>
      <div className="text-[10px] text-neutral-600">{sub}</div>
    </div>
  );
}

function OvCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800/60 bg-gradient-to-b from-neutral-900/40 to-neutral-950/40 px-3 py-2.5 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-neutral-600">{hint}</div>}
    </div>
  );
}

function MoversCard({
  title,
  items,
  dir,
}: {
  title: string;
  items: Awaited<ReturnType<typeof getMarketRows>>;
  dir: "up" | "down";
}) {
  return (
    <div className="glass overflow-hidden">
      <div className="border-b border-neutral-800/60 px-4 py-2.5 text-xs font-medium text-neutral-400">
        {dir === "up" ? "📈" : "📉"} {title}
      </div>
      <div className="divide-y divide-neutral-900/40">
        {items.length === 0 && (
          <div className="px-4 py-4 text-center text-xs text-neutral-600">
            Need ≥2 snapshots
          </div>
        )}
        {items.map((r) => (
          <Link
            key={r.id}
            href={`/market/${encodeURIComponent(r.marketHashName)}`}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-900/30"
          >
            {r.icon && (
              <Image
                src={r.icon}
                alt=""
                width={24}
                height={24}
                unoptimized
                className="h-6 w-6 rounded bg-neutral-800 object-contain"
              />
            )}
            <span className="flex-1 truncate text-sm">{r.name}</span>
            <span className="tabular-nums text-sm text-neutral-400">
              {r.medianPrice != null ? fmt(r.medianPrice) : "—"}
            </span>
            <span
              className={`min-w-[70px] text-right tabular-nums text-sm font-medium ${
                dir === "up" ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {r.change24h != null
                ? `${r.change24h >= 0 ? "+" : ""}${(r.change24h * 100).toFixed(2)}%`
                : "—"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
