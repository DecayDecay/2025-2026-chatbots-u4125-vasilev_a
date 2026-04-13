import { prisma } from "@sbox/db";
import { formatInCurrency, getUserCurrency } from "@/lib/money";
import { unrealizedPnl, realizedPnl } from "@/lib/pnl";
import {
  addPosition,
  deletePosition,
  sellPosition,
  importInventory,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const cur = await getUserCurrency();
  const fmt = (n: number) => formatInCurrency(n, cur.code, cur.rate);
  const positions = await prisma.position.findMany({
    include: {
      item: {
        select: {
          name: true,
          marketHashName: true,
          iconUrl: true,
          snapshots: {
            orderBy: { ts: "desc" },
            take: 1,
            select: { medianPrice: true, lowestPrice: true },
          },
        },
      },
    },
    orderBy: { buyDate: "desc" },
  });

  let totalCost = 0;
  let totalValue = 0;
  let totalRealized = 0;

  const enriched = positions.map((p) => {
    const current =
      Number(
        p.item.snapshots[0]?.medianPrice ?? p.item.snapshots[0]?.lowestPrice ?? 0
      ) || 0;
    const buyPrice = Number(p.buyPrice);
    const sellPrice = p.sellPrice != null ? Number(p.sellPrice) : null;
    const unrl = unrealizedPnl({ qty: p.qty, buyPrice }, current);
    const real =
      sellPrice != null
        ? realizedPnl({ qty: p.qty, buyPrice, sellPrice })
        : null;
    if (sellPrice == null) {
      totalCost += unrl.cost;
      totalValue += unrl.market;
    } else if (real) {
      totalRealized += real.pnl;
    }
    return { p, current, unrl, real };
  });

  const open = enriched.filter((e) => e.p.sellPrice == null);
  const closed = enriched.filter((e) => e.p.sellPrice != null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <a
          href="/portfolio/export"
          className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-orange-500 hover:text-white"
        >
          Export CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Open cost" value={fmt(totalCost)} />
        <Card label="Current value" value={fmt(totalValue)} />
        <Card
          label="Unrealized PnL"
          value={fmt(totalValue - totalCost)}
          color={totalValue - totalCost >= 0 ? "emerald" : "rose"}
        />
        <Card
          label="Realized PnL"
          value={fmt(totalRealized)}
          color={totalRealized >= 0 ? "emerald" : "rose"}
        />
      </div>

      <section className="glass p-4">
        <h2 className="mb-3 text-sm text-neutral-400">Add position</h2>
        <form action={addPosition} className="flex flex-wrap gap-2 text-sm">
          <input
            name="marketHashName"
            placeholder="market_hash_name"
            required
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
          />
          <input
            name="qty"
            type="number"
            min="1"
            placeholder="qty"
            required
            className="w-20 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
          />
          <input
            name="buyPrice"
            type="number"
            step="0.01"
            placeholder="buy $"
            required
            className="w-28 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
          />
          <input
            name="buyDate"
            type="date"
            required
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
          />
          <button className="rounded bg-orange-500 px-3 py-1.5 font-medium text-black hover:bg-orange-400">
            Add
          </button>
        </form>
      </section>

      <section className="glass p-4">
        <h2 className="mb-3 text-sm text-neutral-400">
          Import from public Steam inventory
        </h2>
        <form action={importInventory} className="flex flex-wrap gap-2 text-sm">
          <input
            name="steamId"
            placeholder="SteamID64 (17 digits)"
            required
            pattern="\d{17}"
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
          />
          <button className="rounded bg-orange-500 px-3 py-1.5 font-medium text-black hover:bg-orange-400">
            Import
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          The user&apos;s Steam profile must be public. Each item is added at
          today&apos;s median price; edit afterwards to set your real entry.
        </p>
      </section>

      <PositionsTable
        title={`Open positions · ${open.length}`}
        rows={open}
        showSell
      />
      {closed.length > 0 && (
        <PositionsTable
          title={`Closed positions · ${closed.length}`}
          rows={closed}
          showSell={false}
        />
      )}
    </div>
  );
}

function PositionsTable({
  title,
  rows,
  showSell,
}: {
  title: string;
  rows: ReturnType<typeof toRowType>[];
  showSell: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm text-neutral-400">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-2 py-2 text-left">Item</th>
            <th className="px-2 py-2 text-right">Qty</th>
            <th className="px-2 py-2 text-right">Buy</th>
            <th className="px-2 py-2 text-right">
              {showSell ? "Current" : "Sell"}
            </th>
            <th className="px-2 py-2 text-right">PnL</th>
            <th className="px-2 py-2 text-right">%</th>
            {showSell && <th className="px-2 py-2 text-right">Sell @</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, current, unrl, real }) => {
            const pnl = real?.pnl ?? unrl.pnl;
            const pct = real?.pct ?? unrl.pct;
            return (
              <tr key={p.id} className="border-t border-neutral-800">
                <td className="px-2 py-2">{p.item.name}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.qty}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmt(Number(p.buyPrice))}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {showSell
                    ? current
                      ? fmt(current)
                      : "—"
                    : fmt(Number(p.sellPrice))}
                </td>
                <td
                  className={`px-2 py-2 text-right tabular-nums ${
                    pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmt(pnl)}
                </td>
                <td
                  className={`px-2 py-2 text-right tabular-nums ${
                    pct >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {(pct * 100).toFixed(1)}%
                </td>
                {showSell && (
                  <td className="px-2 py-2 text-right">
                    <form
                      action={sellPosition}
                      className="flex items-center justify-end gap-1"
                    >
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        name="sellPrice"
                        type="number"
                        step="0.01"
                        defaultValue={current.toFixed(2)}
                        className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-right tabular-nums"
                      />
                      <button className="text-xs text-orange-400 hover:underline">
                        sell
                      </button>
                    </form>
                  </td>
                )}
                <td className="px-2 py-2 text-right">
                  <form action={deletePosition}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-xs text-neutral-500 hover:text-rose-400">
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// Tiny helper to give the prop type a name without redeclaring everything.
function toRowType() {
  return {
    p: {} as {
      id: number;
      qty: number;
      buyPrice: unknown;
      sellPrice: unknown;
      item: { name: string };
    },
    current: 0,
    unrl: { cost: 0, market: 0, pnl: 0, pct: 0 },
    real: null as null | { cost: number; got: number; pnl: number; pct: number },
  };
}

function Card({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "emerald" | "rose";
}) {
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-gradient-to-b from-neutral-900/50 to-neutral-950/50 px-3 py-2.5 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg tabular-nums ${
          color === "emerald"
            ? "text-emerald-400"
            : color === "rose"
              ? "text-rose-400"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
