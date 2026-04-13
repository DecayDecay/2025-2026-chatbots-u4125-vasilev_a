FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/db packages/db
COPY apps/web apps/web
RUN pnpm --filter @sbox/db generate
RUN pnpm --filter @sbox/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@sbox/web", "start"]
