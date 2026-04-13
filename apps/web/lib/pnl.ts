// Steam market fee — seller receives ~87% of sticker price.
// (10% Steam + ~3% game-specific; configurable in /settings in future.)
export const STEAM_FEE = 0.13;
export const SELLER_KEEP = 1 - STEAM_FEE;

export interface PositionLike {
  qty: number;
  buyPrice: number; // USD
  sellPrice?: number | null; // USD, sticker price before fee
}

export function netSell(sticker: number) {
  return sticker * SELLER_KEEP;
}

export function unrealizedPnl(p: PositionLike, currentMedianUsd: number) {
  const cost = p.buyPrice * p.qty;
  const market = netSell(currentMedianUsd) * p.qty;
  return { cost, market, pnl: market - cost, pct: cost ? (market - cost) / cost : 0 };
}

export function realizedPnl(p: PositionLike) {
  if (p.sellPrice == null) return null;
  const cost = p.buyPrice * p.qty;
  const got = netSell(p.sellPrice) * p.qty;
  return { cost, got, pnl: got - cost, pct: cost ? (got - cost) / cost : 0 };
}
