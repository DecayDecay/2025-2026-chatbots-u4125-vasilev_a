import { Agent, request } from "undici";
import { env } from "../env.js";
import { log } from "../log.js";

// Shared HTTP agent: small keep-alive pool to keep memory usage flat.
const agent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connections: 2,
  pipelining: 1,
});

// ── Min-interval limiter: no burst at all ─────────────────────────────────
// Live calibration showed Steam blocks ~9 req/10s bursts, then enforces a
// short cool-down. We just space out requests evenly with a hard floor and
// serialize them through a single in-flight chain.
const minIntervalMs = Math.ceil(60_000 / Math.max(1, env.reqPerMin));
let nextSlot = 0;
let chain: Promise<void> = Promise.resolve();

function take(): Promise<void> {
  const p = chain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nextSlot = Math.max(now, nextSlot) + minIntervalMs;
  });
  // Make sure failures in one waiter don't poison the chain.
  chain = p.catch(() => undefined);
  return p;
}

// Globally enforced cool-down: any 429 sets a "no requests until X" floor.
let cooldownUntil = 0;
function applyCooldown(seconds: number) {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + seconds * 1000);
}
async function waitCooldown() {
  const left = cooldownUntil - Date.now();
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

export interface SteamRequestOpts {
  url: string;
  withCookie?: boolean;
  retries?: number;
}

// Small wrapper: rate-limited + exponential backoff on 429/5xx.
// Logs one line per request, only prints body on error.
export async function steamGet<T>({
  url,
  withCookie = false,
  retries = 5,
}: SteamRequestOpts): Promise<T> {
  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) sbox-terminal/0.1",
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
  };
  if (withCookie && env.loginSecure) {
    headers["cookie"] = `steamLoginSecure=${env.loginSecure}`;
  }

  let attempt = 0;
  let backoff = 5_000;
  while (true) {
    await waitCooldown();
    await take();
    const started = Date.now();
    try {
      const res = await request(url, {
        method: "GET",
        headers,
        dispatcher: agent,
      });
      const ms = Date.now() - started;
      if (res.statusCode === 200) {
        log.info({ url, status: 200, ms }, "steam ok");
        return (await res.body.json()) as T;
      }
      // Drain body on error so connection can be reused.
      const body = await res.body.text();
      if (res.statusCode === 429 || res.statusCode >= 500) {
        // Honour Retry-After if present, else our exponential backoff.
        const ra = res.headers["retry-after"];
        const raSec = Array.isArray(ra) ? Number(ra[0]) : Number(ra);
        const cool =
          Number.isFinite(raSec) && raSec > 0 ? raSec : Math.ceil(backoff / 1000);
        applyCooldown(cool);
        log.warn(
          { url, status: res.statusCode, ms, attempt, cool },
          "steam retry"
        );
        if (++attempt > retries) throw new Error(`steam ${res.statusCode}`);
        backoff = Math.min(backoff * 2, 120_000);
        continue;
      }
      log.error({ url, status: res.statusCode, body: body.slice(0, 200) }, "steam fail");
      throw new Error(`steam ${res.statusCode}`);
    } catch (err) {
      if (++attempt > retries) throw err;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 120_000);
    }
  }
}
