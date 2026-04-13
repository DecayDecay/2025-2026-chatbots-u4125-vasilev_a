"use client";
import { useState } from "react";

const JOBS = [
  {
    id: "snapshot",
    label: "Snapshot",
    desc: "Prices + volume for all items",
    time: "~6.5 min",
    icon: "📊",
  },
  {
    id: "catalog",
    label: "Catalog",
    desc: "Item list + sell listings",
    time: "~35s",
    icon: "📋",
  },
  {
    id: "orderbook",
    label: "Order book",
    desc: "Buy/sell walls + spread",
    time: "~6.5 min",
    icon: "📈",
  },
  {
    id: "sboxgame",
    label: "sbox.game",
    desc: "Stock, revenue, momentum",
    time: "~15s",
    icon: "🎮",
  },
  {
    id: "alerts",
    label: "Alerts check",
    desc: "Evaluate & fire active alerts",
    time: "<1s",
    icon: "🔔",
  },
] as const;

export function RefreshPanel() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  async function trigger(jobId: string) {
    setRunning(jobId);
    setResults((r) => ({ ...r, [jobId]: "running..." }));
    try {
      const res = await fetch(`/api/refresh?job=${jobId}`, { method: "POST" });
      const data = await res.json();
      setResults((r) => ({
        ...r,
        [jobId]: data.ok
          ? `ok — ${data.output?.slice(0, 80) ?? "done"}`
          : `error — ${data.error?.slice(0, 80)}`,
      }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [jobId]: `network error`,
      }));
    }
    setRunning(null);
  }

  return (
    <div className="space-y-2">
      {JOBS.map((j) => {
        const isRunning = running === j.id;
        const result = results[j.id];
        return (
          <div
            key={j.id}
            className="flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-950/60 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{j.icon}</span>
              <div>
                <div className="text-sm font-medium">{j.label}</div>
                <div className="text-[11px] text-neutral-500">
                  {j.desc} · {j.time}
                </div>
                {result && (
                  <div
                    className={`mt-1 text-[11px] ${
                      result.startsWith("ok")
                        ? "text-emerald-400"
                        : result === "running..."
                          ? "text-orange-400"
                          : "text-rose-400"
                    }`}
                  >
                    {result}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => trigger(j.id)}
              disabled={running !== null}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                isRunning
                  ? "animate-pulse bg-orange-600 text-white"
                  : running !== null
                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                    : "bg-orange-500 text-black hover:bg-orange-400 active:scale-[0.97]"
              }`}
            >
              {isRunning ? "Running..." : "Run"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
