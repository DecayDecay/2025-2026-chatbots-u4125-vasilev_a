// Visual order book "walls" — top N buy and sell levels as horizontal bars.
// Width = that level's qty relative to the biggest wall on this side.
// Color: emerald for buys, rose for sells.
export function OrderBookDepth({
  buyWalls,
  sellWalls,
}: {
  buyWalls: Array<[number, number]>;
  sellWalls: Array<[number, number]>;
}) {
  if (!buyWalls?.length && !sellWalls?.length) return null;
  const maxBuy = Math.max(1, ...buyWalls.map(([, q]) => q));
  const maxSell = Math.max(1, ...sellWalls.map(([, q]) => q));

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-500">
          <span>Buy orders</span>
          <span>qty</span>
        </div>
        <div className="space-y-0.5">
          {buyWalls.slice(0, 8).map(([price, qty], i) => (
            <div
              key={i}
              className="relative flex items-center justify-between rounded-sm px-1.5 py-0.5 text-[11px] tabular-nums"
            >
              <div
                className="absolute inset-y-0 right-0 rounded-sm bg-emerald-500/10"
                style={{ width: `${(qty / maxBuy) * 100}%` }}
              />
              <span className="relative text-emerald-400">
                ${price.toFixed(2)}
              </span>
              <span className="relative text-neutral-300">{qty}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-500">
          <span>Sell orders</span>
          <span>qty</span>
        </div>
        <div className="space-y-0.5">
          {sellWalls.slice(0, 8).map(([price, qty], i) => (
            <div
              key={i}
              className="relative flex items-center justify-between rounded-sm px-1.5 py-0.5 text-[11px] tabular-nums"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-rose-500/10"
                style={{ width: `${(qty / maxSell) * 100}%` }}
              />
              <span className="relative text-rose-400">
                ${price.toFixed(2)}
              </span>
              <span className="relative text-neutral-300">{qty}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
