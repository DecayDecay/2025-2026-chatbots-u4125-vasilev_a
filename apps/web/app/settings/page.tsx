import { RefreshPanel } from "@/components/RefreshPanel";
import { getUserCurrency } from "@/lib/money";
import { prisma } from "@sbox/db";
import { switchCurrency } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { code, rate, symbol } = await getUserCurrency();
  const fxRow = await prisma.fxRate.findUnique({ where: { code: "KZT" } });

  return (
    <div className="space-y-8 text-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* ── Currency ──────────────────────────────────────────── */}
      <section className="glass p-5">
        <h2 className="mb-1 text-sm font-medium text-neutral-200">
          Display currency
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          All data is stored in USD. Switching to KZT converts displayed
          prices at the current exchange rate. Portfolio buy prices are kept
          in USD internally.
        </p>

        <form action={switchCurrency} className="flex items-center gap-4">
          <div className="flex gap-2">
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition-all ${
                code === "USD"
                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                  : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name="currency"
                value="USD"
                defaultChecked={code === "USD"}
                className="hidden"
              />
              <span className="text-lg">$</span>
              <div>
                <div className="font-medium">USD</div>
                <div className="text-[10px] text-neutral-500">US Dollar</div>
              </div>
            </label>

            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition-all ${
                code === "KZT"
                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                  : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name="currency"
                value="KZT"
                defaultChecked={code === "KZT"}
                className="hidden"
              />
              <span className="text-lg">₸</span>
              <div>
                <div className="font-medium">KZT</div>
                <div className="text-[10px] text-neutral-500">
                  Kazakhstani Tenge
                </div>
              </div>
            </label>
          </div>

          <button
            type="submit"
            className="rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-black transition-all hover:bg-orange-400 active:scale-[0.98]"
          >
            Apply
          </button>
        </form>

        <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
          <span>
            Current: <strong className="text-neutral-300">{symbol} {code}</strong>
          </span>
          {code === "KZT" && (
            <span>
              Rate: 1 USD = <strong className="text-neutral-300">₸{Number(rate).toFixed(2)}</strong>
            </span>
          )}
          {fxRow && (
            <span>
              Updated: {fxRow.ts.toLocaleString()}
            </span>
          )}
        </div>
      </section>

      {/* ── Refresh ───────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-200">
          Manual data refresh
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          Click Run to trigger any scraper on demand.
        </p>
        <RefreshPanel />
      </section>

      {/* ── Schedule ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-200">
          Auto-refresh schedule
        </h2>
        <div className="glass overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-neutral-900/70 text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left">Job</th>
                <th className="px-3 py-2 text-left">Schedule</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Duration</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {[
                ["Snapshot", "every 10 min", "Steam priceoverview", "~6.5 min"],
                ["Order book", "every 30 min", "Steam histogram", "~6.5 min"],
                ["Catalog", "every 6 hours", "Steam search/render", "~35s"],
                ["sbox.game", "every hour", "sbox.game (Playwright)", "~15s"],
                ["Alerts", "after snapshot", "local DB", "<1s"],
                ["Prune", "daily 04:30", "local DB", "<1s"],
              ].map(([job, sched, src, dur]) => (
                <tr key={job} className="border-t border-neutral-900">
                  <td className="px-3 py-2">{job}</td>
                  <td className="px-3 py-2">{sched}</td>
                  <td className="px-3 py-2 text-neutral-500">{src}</td>
                  <td className="px-3 py-2">{dur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          Auto-refresh requires the worker:{" "}
          <code>pnpm --filter @sbox/worker dev</code>
        </p>
      </section>
    </div>
  );
}
