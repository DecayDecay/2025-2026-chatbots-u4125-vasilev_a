FROM node:18-alpine
WORKDIR /app
RUN npm install -g pnpm@9

# Copy workspace root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db ./packages/db
COPY apps/bot ./apps/bot
COPY apps/worker ./apps/worker

# Install + generate Prisma
RUN pnpm install --frozen-lockfile --prod=false
RUN cd packages/db && npx prisma generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@sbox/bot", "start"]
