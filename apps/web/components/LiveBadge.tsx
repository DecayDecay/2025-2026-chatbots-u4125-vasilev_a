// Single-line status pill: pulsing green dot + LIVE/STALE/no-data + age.
// No clutter — one row the eye can parse at a glance.
export function LiveBadge({
  lastTs,
  ok,
}: {
  lastTs: Date | null;
  ok: boolean;
}) {
  if (!lastTs || !ok) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-500">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
        no data
      </div>
    );
  }
  const ageMs = Date.now() - new Date(lastTs).getTime();
  const min = Math.round(ageMs / 60_000);
  const fresh = min < 15;
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        fresh
          ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-400"
          : "border-amber-900/60 bg-amber-950/40 text-amber-400"
      }`}
    >
      <span
        className={`relative h-1.5 w-1.5 rounded-full ${
          fresh ? "bg-emerald-400" : "bg-amber-400"
        }`}
      >
        {fresh && (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
      </span>
      <span className="font-medium">{fresh ? "LIVE" : "STALE"}</span>
      <span className="text-neutral-500">· {min}m</span>
    </div>
  );
}
