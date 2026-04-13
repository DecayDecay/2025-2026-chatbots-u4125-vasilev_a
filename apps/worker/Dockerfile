FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install deps at repo root (pnpm workspaces)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/db packages/db
COPY apps/worker apps/worker
RUN pnpm --filter @sbox/db generate

CMD ["pnpm", "--filter", "@sbox/worker", "dev"]
