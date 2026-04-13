import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "@sbox/db";
import { log } from "../log.js";

// sbox.game is a Blazor Server app — no REST API. We drive a headless
// browser to render the page, switch timeframe tabs, and pull structured
// rows out of the DOM.
//
// The Skin Sales table exposes a timeframe selector (All Time / 30 Days /
// 7 Days / 1 Days). We capture all four so we can derive velocity and
// show time-sliced revenue charts.

export type SboxTimeframe = "all" | "30d" | "7d" | "1d";

export interface SboxSaleRow {
  name: string;
  usd: number; // total USD traded in the timeframe
  units: number; // total units traded in the timeframe
}

export interface SboxProbeResult {
  latest: SboxSaleRow[]; // last N sales ticker (no timeframe)
  topEarning: Array<{ name: string; usd: number }>; // lifetime top earners
  salesByTimeframe: Record<SboxTimeframe, SboxSaleRow[]>;
  scrapedAt: string;
}

function parseUsd(s: string): number {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function parseInt10(s: string): number {
  const n = Number(s.replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Pull the 3 top-level tables under their respective h2/h3 headings.
// Each `<table>` the Blazor page renders has 2 or 3 cells per row —
// we read them back in document order. Written entirely inline to dodge
// tsx's `__name` helper injection (which would break inside evaluate).
async function extractTables(page: Page): Promise<string[][][]> {
  return page.evaluate(
    `(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map(function (t) {
        const rows = Array.from(t.querySelectorAll('tr'));
        const out = [];
        for (const r of rows) {
          const cells = Array.from(r.querySelectorAll('td, th')).map(function (c) {
            return (c.textContent || '').trim();
          });
          if (cells.length >= 2 && !/^item$/i.test(cells[0] || '')) {
            out.push(cells);
          }
        }
        return out;
      });
    })()`
  ) as Promise<string[][][]>;
}

async function clickTimeframe(page: Page, label: string): Promise<boolean> {
  // The tab strip is a series of anchors/buttons with visible text.
  const handle = await page.$(`text=${label}`);
  if (!handle) return false;
  await handle.click({ timeout: 2000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  return true;
}

export async function probeSboxGameMetrics(): Promise<SboxProbeResult> {
  log.info("sboxGame probe start");
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      viewport: { width: 1440, height: 1200 },
    });
    const page = await ctx.newPage();
    await page.goto("https://sbox.game/metrics/skins", {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForTimeout(3500);

    // Initial extraction (default is All Time for Skin Sales).
    let tables = await extractTables(page);
    // tables[0] = Latest (Item, USD, Units)
    // tables[1] = Top Earning (Item, USD)
    // tables[2] = Skin Sales (Item, USD, Units)
    const latest: SboxSaleRow[] = (tables[0] ?? []).map((r) => ({
      name: r[0],
      usd: parseUsd(r[1] ?? "0"),
      units: parseInt10(r[2] ?? "0"),
    }));
    const topEarning = (tables[1] ?? []).map((r) => ({
      name: r[0],
      usd: parseUsd(r[1] ?? "0"),
    }));

    const salesByTimeframe: Record<SboxTimeframe, SboxSaleRow[]> = {
      all: [],
      "30d": [],
      "7d": [],
      "1d": [],
    };
    const steps: Array<{ tf: SboxTimeframe; label: string }> = [
      { tf: "all", label: "All Time" },
      { tf: "30d", label: "30 Days" },
      { tf: "7d", label: "7 Days" },
      { tf: "1d", label: "1 Days" },
    ];
    for (const { tf, label } of steps) {
      const clicked = await clickTimeframe(page, label);
      if (!clicked && tf !== "all") {
        log.warn({ label }, "sboxGame tab click failed");
      }
      await page.waitForTimeout(500);
      tables = await extractTables(page);
      const t = tables[2] ?? [];
      salesByTimeframe[tf] = t.map((r) => ({
        name: r[0],
        usd: parseUsd(r[1] ?? "0"),
        units: parseInt10(r[2] ?? "0"),
      }));
    }

    const result: SboxProbeResult = {
      latest,
      topEarning,
      salesByTimeframe,
      scrapedAt: new Date().toISOString(),
    };
    log.info(
      {
        latest: latest.length,
        topEarning: topEarning.length,
        all: salesByTimeframe.all.length,
        d30: salesByTimeframe["30d"].length,
        d7: salesByTimeframe["7d"].length,
        d1: salesByTimeframe["1d"].length,
      },
      "sboxGame probe ok"
    );
    return result;
  } finally {
    if (browser) await browser.close();
  }
}

// Persist the probe result into SboxGameStat. Matching is done by
// Item.name (case-insensitive) since sbox.game uses the display name and
// our Item.name is also the display name. Unknown items are logged and
// skipped — they'll be picked up once the catalog scrape registers them.
export async function runSboxGameRefresh() {
  const run = await prisma.scrapeRun.create({ data: { kind: "sboxgame" } });
  const started = Date.now();
  try {
    const data = await probeSboxGameMetrics();

    const items = await prisma.item.findMany({
      select: { id: true, name: true, marketHashName: true },
    });
    const byName = new Map<string, number>();
    for (const it of items) {
      byName.set(it.name.toLowerCase(), it.id);
      byName.set(it.marketHashName.toLowerCase(), it.id);
    }

    let written = 0;
    let unmatched = 0;
    for (const [tf, rows] of Object.entries(data.salesByTimeframe) as Array<
      [string, typeof data.salesByTimeframe.all]
    >) {
      for (const r of rows) {
        const id = byName.get(r.name.toLowerCase());
        if (!id) {
          unmatched++;
          continue;
        }
        await prisma.sboxGameStat.upsert({
          where: { itemId_timeframe: { itemId: id, timeframe: tf } },
          create: {
            itemId: id,
            timeframe: tf,
            usdRevenue: r.usd,
            units: r.units,
          },
          update: {
            usdRevenue: r.usd,
            units: r.units,
            scrapedAt: new Date(),
          },
        });
        written++;
      }
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: true,
        itemsProcessed: written,
      },
    });
    log.info(
      { written, unmatched, duration: Date.now() - started },
      "sboxGameRefresh ok"
    );
    return { written, unmatched };
  } catch (err) {
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    log.error({ err }, "sboxGameRefresh fail");
    throw err;
  }
}
