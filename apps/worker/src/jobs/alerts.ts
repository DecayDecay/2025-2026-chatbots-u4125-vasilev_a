import { prisma } from "@sbox/db";
import { log } from "../log.js";

// Evaluates every active alert against the freshest data we have.
// Supported alert types:
//   - above       — current median ≥ threshold
//   - below       — current median ≤ threshold
//   - change_pct  — |Δ vs prior snapshot| ≥ threshold (e.g. 10 for 10%)
//   - sales_spike — sales24h ≥ threshold (raw count)
//   - snipe       — lowest price ≤ median × (1 - threshold/100)
//
// Fired alerts are deactivated and tagged with firedAt + firedPrice.
// Counters are bumped so the UI can show "fired N times" history.
export async function runAlertsCheck() {
  const alerts = await prisma.alert.findMany({ where: { active: true } });
  if (!alerts.length) return { fired: 0 };

  const itemIds = [...new Set(alerts.map((a) => a.itemId))];

  // Latest snapshot.
  const latest = await prisma.priceSnapshot.findMany({
    where: { itemId: { in: itemIds } },
    orderBy: { ts: "desc" },
    distinct: ["itemId"],
    select: {
      itemId: true,
      medianPrice: true,
      lowestPrice: true,
      volume24h: true,
    },
  });
  const latestById = new Map(latest.map((s) => [s.itemId, s]));

  // Second-most-recent for change_pct calculation.
  const prior = (await prisma.$queryRawUnsafe(
    `WITH ranked AS (
       SELECT "itemId", "medianPrice", "lowestPrice",
              ROW_NUMBER() OVER (PARTITION BY "itemId" ORDER BY "ts" DESC) AS rn
       FROM "PriceSnapshot"
       WHERE "itemId" = ANY($1::int[]) AND "medianPrice" IS NOT NULL
     )
     SELECT * FROM ranked WHERE rn = 2`,
    itemIds
  )) as Array<{ itemId: number; medianPrice: unknown; lowestPrice: unknown }>;
  const priorById = new Map(
    prior.map((p) => [p.itemId, Number(p.medianPrice ?? p.lowestPrice ?? 0)])
  );

  let fired = 0;
  for (const a of alerts) {
    const s = latestById.get(a.itemId);
    if (!s) continue;
    const median = Number(s.medianPrice ?? s.lowestPrice ?? 0) || 0;
    const lowest = Number(s.lowestPrice ?? s.medianPrice ?? 0) || 0;
    const thr = Number(a.threshold);
    let hit = false;
    let firedPrice: number | null = median;

    switch (a.type) {
      case "above":
        hit = median >= thr;
        break;
      case "below":
        hit = median <= thr && median > 0;
        break;
      case "change_pct": {
        const old = priorById.get(a.itemId);
        if (old && old > 0) {
          const pct = Math.abs((median - old) / old) * 100;
          hit = pct >= thr;
        }
        break;
      }
      case "sales_spike":
        hit = (s.volume24h ?? 0) >= thr;
        firedPrice = null;
        break;
      case "snipe":
        if (median > 0) {
          const target = median * (1 - thr / 100);
          hit = lowest > 0 && lowest <= target;
          firedPrice = lowest;
        }
        break;
    }

    if (!hit) continue;
    await prisma.alert.update({
      where: { id: a.id },
      data: {
        active: false,
        firedAt: new Date(),
        firedPrice,
        fireCount: { increment: 1 },
      },
    });
    fired++;
  }
  if (fired) log.info({ fired }, "alertsCheck fired");
  return { fired };
}
