import Link from "next/link";
import Image from "next/image";
import { getMarketRows, getDistinctTypes, getWatchlistIds } from "@/lib/queries";
import { formatInCurrency, getUserCurrency } from "@/lib/money";
import { WatchStar } from "@/components/WatchStar";
import { MarketCard } from "@/components/MarketCard";

export const dynamic = "force-dynamic";

type SP = {
  q?: string;
  type?: string;
  min?: string;
  max?: string;
  vol?: string;
  minStock?: string;
  maxStock?: string;
  deals?: string;
  watch?: string;
  view?: "list" | "grid";
  sort?:
    | "name"
    | "price"
    | "volume"
    | "delta"
    | "drawdown"
    | "deal"
    | "cap"
    | "volusd"
    | "stock"
    | "rare"
    | "lifetime"
    | "momentum"
    | "truecap";
};

export default async function MarketPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = searchParams;
  const view = sp.view ?? "list";
  const cur = await getUserCurrency();
  const fmt = (n: number) => formatInCurrency(n, cur.code, cur.rate);
  const [rows, types, watched] = await Promise.all([
    getMarketRows({
      search: sp.q,
      type: sp.type,
      minPrice: sp.min ? Number(sp.min) : undefined,
      maxPrice: sp.max ? Number(sp.max) : undefined,
      minVolume: sp.vol ? Number(sp.vol) : undefined,
      minStock: sp.minStock ? Number(sp.minStock) : undefined,
      maxStock: sp.maxStock ? Number(sp.maxStock) : undefined,
      deals: sp.deals === "1",
      watchOnly: sp.watch === "1",
      sort: sp.sort ?? "volume",
    }),
    getDistinctTypes(),
    getWatchlistIds(),
  ]);
  const watchSet = new Set(watched);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
      {/* Sticky filter sidebar */}
      <aside className="md:sticky md:top-4 md:self-start">
        <form
          method="get"
          className="space-y-4 rounded border border-neutral-800 bg-neutral-950 p-4 text-sm"
        >
          <div>
            <label className="mb-1 block text-xs uppercase text-neutral-500">
              Search
            </label>
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Item name..."
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase text-neutral-500">
              Type
            </label>
            <select
              name="type"
              defaultValue={sp.type ?? ""}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
            >
              <option value="">All</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase text-neutral-500">
              Price $
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                name="min"
                defaultValue={sp.min ?? ""}
                placeholder="min"
                step="0.01"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
              />
              <input
                type="number"
                name="max"
                defaultValue={sp.max ?? ""}
                placeholder="max"
                step="0.01"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase text-neutral-500">
              Min sales 24h
            </label>
            <input
              type="number"
              name="vol"
              defaultValue={sp.vol ?? ""}
              placeholder="0"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs uppercase text-neutral-500"
              title="Total units ever sold on the market (from sbox.game)"
            >
              Stock (units)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                name="minStock"
                defaultValue={sp.minStock ?? ""}
                placeholder="min"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
              />
              <input
                type="number"
                name="maxStock"
                defaultValue={sp.maxStock ?? ""}
                placeholder="max"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase text-neutral-500">
              Sort
            </label>
            <select
              name="sort"
              defaultValue={sp.sort ?? "volume"}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 outline-none focus:border-orange-500"
            >
              <option value="volume">Sales 24h</option>
              <option value="volusd">Volume $ 24h</option>
              <option value="cap">Listed value ↓</option>
              <option value="truecap">True cap ↓ (fp)</option>
              <option value="lifetime">Lifetime rev ↓ (fp)</option>
              <option value="stock">Stock ↓ (fp)</option>
              <option value="rare">Rare ↑ (low stock)</option>
              <option value="momentum">Momentum 30d ↓</option>
              <option value="price">Price ↓</option>
              <option value="delta">Δ 24h ↑</option>
              <option value="drawdown">Drawdown ↓</option>
              <option value="deal">Best deal</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded bg-orange-500 px-3 py-1.5 font-medium text-black hover:bg-orange-400"
            >
              Apply
            </button>
            <a
              href="/market"
              className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-400 hover:text-white"
            >
              Reset
            </a>
          </div>

          <div className="border-t border-neutral-800 pt-3 text-xs text-neutral-500">
            Quick presets:
            <div className="mt-2 flex flex-wrap gap-1">
              <a
                href="/market?max=1&sort=volume"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
              >
                &lt; $1
              </a>
              <a
                href="/market?vol=100&sort=volume"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
              >
                high vol
              </a>
              <a
                href="/market?sort=delta"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
              >
                gainers
              </a>
              <a
                href="/market?deals=1&sort=deal"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
              >
                snipes
              </a>
              <a
                href="/market?sort=drawdown"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
              >
                bottoms
              </a>
              <a
                href="/market?watch=1"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
              >
                ★ watchlist
              </a>
              <a
                href="/market?sort=rare&maxStock=1000"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
                title="Items with < 1k total units ever sold (sbox.game data)"
              >
                ◆ rare
              </a>
              <a
                href="/market?sort=truecap"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
                title="Sorted by lifetime revenue (sbox.game data)"
              >
                blue chips
              </a>
              <a
                href="/market?sort=momentum"
                className="rounded bg-neutral-900 px-2 py-1 hover:bg-neutral-800"
                title="Highest share of lifetime revenue earned in the last 30 days"
              >
                momentum
              </a>
            </div>
          </div>
        </form>
      </aside>

      {/* Results */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
            <p className="text-xs text-neutral-500">{rows.length} items</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            <a
              href={`?${new URLSearchParams({ ...sp, view: "list" } as Record<string, string>).toString()}`}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                view === "list"
                  ? "bg-orange-500 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              ☰ List
            </a>
            <a
              href={`?${new URLSearchParams({ ...sp, view: "grid" } as Record<string, string>).toString()}`}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                view === "grid"
                  ? "bg-orange-500 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              ▦ Grid
            </a>
          </div>
        </div>

        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((r) => (
              <MarketCard key={r.id} r={r} watched={watchSet.has(r.id)} />
            ))}
            {!rows.length && (
              <div className="col-span-full py-16 text-center text-neutral-500">
                No items match the filters.
              </div>
            )}
          </div>
        ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800/80 bg-neutral-950/50 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
              <tr>
                <th className="w-8" />
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Lowest</th>
                <th className="px-3 py-2 text-right">Median</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Lowest price vs median; ≤ -5% = a snipe deal"
                >
                  Deal
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Number of items sold in the last 24 hours"
                >
                  Sales 24h
                </th>
                <th className="px-3 py-2 text-right">Δ 24h</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Drop from all-time high we have observed"
                >
                  Drawdown
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Median × active sell listings — what's listed on the market right now at median price"
                >
                  Listed
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Total units ever sold on the market (from sbox.game)"
                >
                  Stock
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Lifetime $ revenue from sbox.game — the real supply data point"
                >
                  Lifetime $
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Share of lifetime revenue earned in the last 30 days"
                >
                  Momentum 30d
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-neutral-800 hover:bg-neutral-900/50"
                  style={
                    r.rarityBg
                      ? { boxShadow: `inset 3px 0 0 0 ${r.rarityBg}` }
                      : undefined
                  }
                >
                  <td className="pl-2">
                    <WatchStar itemId={r.id} active={watchSet.has(r.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/market/${encodeURIComponent(r.marketHashName)}`}
                      className="flex items-center gap-2 hover:text-orange-400"
                    >
                      {r.icon ? (
                        <Image
                          src={r.icon}
                          alt=""
                          width={36}
                          height={36}
                          unoptimized
                          className="h-9 w-9 rounded bg-neutral-800 object-contain"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded bg-neutral-800" />
                      )}
                      <span className="truncate">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-400">
                    {r.type ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.lowestPrice != null ? fmt(r.lowestPrice) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.medianPrice != null ? fmt(r.medianPrice) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.dealDiscount == null
                        ? "text-neutral-500"
                        : r.dealDiscount <= -0.05
                          ? "font-medium text-emerald-400"
                          : "text-neutral-400"
                    }`}
                  >
                    {r.dealDiscount == null
                      ? "—"
                      : `${(r.dealDiscount * 100).toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.sales24h ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.change24h == null
                        ? "text-neutral-500"
                        : r.change24h >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    }`}
                  >
                    {r.change24h == null
                      ? "—"
                      : `${r.change24h >= 0 ? "+" : ""}${(r.change24h * 100).toFixed(2)}%`}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.drawdown == null
                        ? "text-neutral-500"
                        : r.drawdown < -0.1
                          ? "text-rose-400"
                          : "text-neutral-400"
                    }`}
                  >
                    {r.drawdown == null
                      ? "—"
                      : `${(r.drawdown * 100).toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                    {r.listedValue != null ? fmt(r.listedValue) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                    {r.stock != null
                      ? r.stock.toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                    {r.lifetimeRev != null
                      ? fmt(r.lifetimeRev)
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.momentum30d == null
                        ? "text-neutral-500"
                        : r.momentum30d >= 0.5
                          ? "text-orange-400 font-medium"
                          : "text-neutral-400"
                    }`}
                    title={
                      r.momentum30d != null
                        ? `${(r.momentum30d * 100).toFixed(1)}% of lifetime revenue in last 30d`
                        : undefined
                    }
                  >
                    {r.momentum30d == null
                      ? "—"
                      : `${(r.momentum30d * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-10 text-center text-neutral-500"
                  >
                    No items match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
