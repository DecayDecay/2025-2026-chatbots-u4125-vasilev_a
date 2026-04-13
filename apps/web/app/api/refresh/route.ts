import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// One-shot trigger for any scraper job. Runs the worker CLI in a child
// process so the web server doesn't need BullMQ/Redis wired in.
// POST /api/refresh?job=snapshot|catalog|orderbook|sboxgame|alerts
export async function POST(req: Request) {
  const url = new URL(req.url);
  const job = url.searchParams.get("job");
  const allowed = ["snapshot", "catalog", "orderbook", "sboxgame", "alerts"];
  if (!job || !allowed.includes(job)) {
    return NextResponse.json(
      { error: `job must be one of: ${allowed.join(", ")}` },
      { status: 400 }
    );
  }

  const workerDir = path.resolve(process.cwd(), "..", "worker");
  const cmd = `npx tsx src/cli.ts ${job}`;
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://sbox:sbox@localhost:5432/sbox?schema=public",
  };

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: workerDir,
      env,
      timeout: 600_000, // 10 min max (sboxgame needs Playwright)
    });
    // Extract the last JSON log line as result.
    const lines = (stdout + stderr).trim().split("\n");
    const last = lines[lines.length - 1];
    return NextResponse.json({ ok: true, job, output: last });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, job, error: msg.slice(0, 500) }, { status: 500 });
  }
}
