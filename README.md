# s&box Steam Market Terminal

Local dashboard for tracking Steam Community Market items for s&box (appid 590830).

## Quick start

```bash
cp .env.example .env
# (optional) paste your steamLoginSecure cookie into .env for pricehistory
docker compose up -d postgres redis
pnpm install
pnpm --filter @sbox/db migrate:dev --name init
pnpm --filter @sbox/worker run:catalog   # one-off: pull the catalog
pnpm dev:worker                          # background scraper + scheduler
pnpm dev:web                             # http://localhost:3000
```

Or run everything in Docker:

```bash
docker compose up -d --build
```

## Layout

- `apps/web` — Next.js 15 dashboard (`/`, `/market`, `/market/[hash]`, `/portfolio`, `/alerts`, `/settings`)
- `apps/worker` — Node BullMQ worker: catalog refresh, snapshots, history backfill, alerts, prune
- `packages/db` — Prisma schema + client

## Jobs

| Job        | Schedule       | Endpoint                              |
|------------|----------------|---------------------------------------|
| catalog    | hourly         | `market/search/render`                |
| snapshot   | every 20 min   | `market/priceoverview`                |
| orderbook  | every hour     | `market/itemordershistogram` (anon)   |
| alerts     | after snapshot | local                                  |
| prune      | daily 04:30    | drops old PriceSnapshot/OrderBook     |
| history    | manual         | `market/pricehistory` (cookie req.)   |

**Anonymous mode:** the worker runs fully without any Steam login. The
history backfill is the only piece that needs a `steamLoginSecure` cookie,
and it's a one-shot operation triggered manually from the CLI / UI when you
want to import a year of daily candles. Day-to-day everything (prices,
volumes, order books, gainers/losers) comes from anonymous endpoints.

## Memory budget (per container)

| Service  | RAM   |
|----------|-------|
| postgres | 512MB |
| redis    | 128MB |
| worker   | 256MB |
| web      | 384MB |

Logs are pino → docker json-file driver, capped at `5m × 3` per container.
