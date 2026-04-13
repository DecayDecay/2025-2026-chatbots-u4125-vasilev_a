import { prisma } from "@sbox/db";
import { formatInCurrency, getUserCurrency } from "@/lib/money";
import { createAlert, deleteAlert, reactivateAlert } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  above: "Median ≥ threshold",
  below: "Median ≤ threshold",
  change_pct: "|Δ vs prev| ≥ %",
  sales_spike: "Sales 24h ≥ count",
  snipe: "Lowest ≤ median × (1 - %)",
};

export default async function AlertsPage() {
  const cur = await getUserCurrency();
  const fmt = (n: number) => formatInCurrency(n, cur.code, cur.rate);
  const alerts = await prisma.alert.findMany({
    include: { item: { select: { name: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Alerts</h1>

      <form
        action={createAlert}
        className="glass grid grid-cols-1 gap-2 p-4 text-sm md:grid-cols-[1fr_auto_auto_auto]"
      >
        <input
          name="marketHashName"
          placeholder="market_hash_name"
          required
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
        />
        <select
          name="type"
          defaultValue="below"
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
        >
          <option value="above">price above $</option>
          <option value="below">price below $</option>
          <option value="change_pct">change ≥ %</option>
          <option value="sales_spike">sales spike ≥ count</option>
          <option value="snipe">snipe ≥ % below median</option>
        </select>
        <input
          name="threshold"
          type="number"
          step="0.01"
          placeholder="value"
          required
          className="w-32 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5"
        />
        <button className="rounded bg-orange-500 px-3 py-1.5 font-medium text-black hover:bg-orange-400">
          Create
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-950/50 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Rule</th>
              <th className="px-3 py-2 text-right">Threshold</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Fired @</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-xs text-neutral-500"
                >
                  No alerts yet. Create one above.
                </td>
              </tr>
            )}
            {alerts.map((a) => (
              <tr key={a.id} className="border-t border-neutral-800">
                <td className="px-3 py-2">{a.item.name}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">
                  {TYPE_LABELS[a.type] ?? a.type}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {a.type === "change_pct" ||
                  a.type === "snipe" ||
                  a.type === "sales_spike"
                    ? Number(a.threshold).toString()
                    : fmt(Number(a.threshold))}
                </td>
                <td className="px-3 py-2 text-center text-xs">
                  {a.active ? (
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-400">
                      active
                    </span>
                  ) : (
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">
                      fired
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs text-neutral-400">
                  {a.firedAt
                    ? `${a.firedAt.toLocaleString()}${
                        a.firedPrice
                          ? ` @ ${fmt(Number(a.firedPrice))}`
                          : ""
                      }`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                  {a.fireCount}
                </td>
                <td className="px-3 py-2 text-right">
                  {!a.active && (
                    <form action={reactivateAlert} className="inline">
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-xs text-orange-400 hover:underline">
                        re-arm
                      </button>
                    </form>
                  )}{" "}
                  <form action={deleteAlert} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="text-xs text-neutral-500 hover:text-rose-400">
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
