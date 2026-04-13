import { prisma } from "@sbox/db";
import { SELLER_KEEP } from "@/lib/pnl";

export const dynamic = "force-dynamic";

// CSV export of all positions with computed unrealized/realized PnL.
// Designed to be openable in Excel/Google Sheets without surprises.
export async function GET() {
  const positions = await prisma.position.findMany({
    include: {
      item: {
        select: {
          name: true,
          marketHashName: true,
          snapshots: {
            orderBy: { ts: "desc" },
            take: 1,
            select: { medianPrice: true, lowestPrice: true },
          },
        },
      },
    },
    orderBy: { buyDate: "asc" },
  });

  const header = [
    "id",
    "item",
    "market_hash_name",
    "qty",
    "buy_price",
    "buy_date",
    "sell_price",
    "sell_date",
    "current_median",
    "cost_usd",
    "value_usd_after_fee",
    "pnl_usd",
    "pnl_pct",
    "status",
  ];
  const lines: string[] = [header.join(",")];
  for (const p of positions) {
    const median =
      Number(
        p.item.snapshots[0]?.medianPrice ?? p.item.snapshots[0]?.lowestPrice ?? 0
      ) || 0;
    const buy = Number(p.buyPrice);
    const sell = p.sellPrice != null ? Number(p.sellPrice) : null;
    const cost = buy * p.qty;
    const value = (sell ?? median) * SELLER_KEEP * p.qty;
    const pnl = value - cost;
    const pnlPct = cost ? pnl / cost : 0;
    const status = sell != null ? "closed" : "open";
    lines.push(
      [
        p.id,
        JSON.stringify(p.item.name),
        p.item.marketHashName,
        p.qty,
        buy.toFixed(4),
        p.buyDate.toISOString(),
        sell?.toFixed(4) ?? "",
        p.sellDate?.toISOString() ?? "",
        median.toFixed(4),
        cost.toFixed(2),
        value.toFixed(2),
        pnl.toFixed(2),
        (pnlPct * 100).toFixed(2),
        status,
      ].join(",")
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="portfolio-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
