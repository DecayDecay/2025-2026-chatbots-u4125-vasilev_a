"use client";
import { useState } from "react";

// One-click refresh button on the dashboard. Triggers snapshot (the most
// frequently needed update) and reloads the page when done.
export function QuickRefresh() {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await fetch("/api/refresh?job=snapshot", { method: "POST" });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      title="Run a fresh snapshot (prices + volume) and reload"
      className={`rounded-full border px-3 py-1 text-xs transition-all ${
        busy
          ? "animate-pulse border-orange-600 bg-orange-950/40 text-orange-400"
          : "border-neutral-800 bg-neutral-950/70 text-neutral-400 hover:border-orange-500/50 hover:text-orange-400"
      }`}
    >
      {busy ? "⟳ Updating..." : "⟳ Refresh"}
    </button>
  );
}
