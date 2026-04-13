-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "type" TEXT,
    "tags" JSONB,
    "nameId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScrapedAt" TIMESTAMP(3),
    "nameIdResolvedAt" TIMESTAMP(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lowestPrice" DECIMAL(12,4),
    "medianPrice" DECIMAL(12,4),
    "volume24h" INTEGER,
    "sellListings" INTEGER,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" BIGSERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "volume" INTEGER NOT NULL,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBook" (
    "id" BIGSERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buyTop" DECIMAL(12,4),
    "sellTop" DECIMAL(12,4),
    "spreadPct" DECIMAL(8,4),
    "buyTotalUsd" DECIMAL(14,2),
    "sellTotalUsd" DECIMAL(14,2),
    "liquidityScore" DECIMAL(14,2),
    "buyWalls" JSONB,
    "sellWalls" JSONB,

    CONSTRAINT "OrderBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "buyPrice" DECIMAL(12,4) NOT NULL,
    "buyPriceOriginal" DECIMAL(14,4),
    "buyCurrency" TEXT NOT NULL DEFAULT 'USD',
    "buyDate" TIMESTAMP(3) NOT NULL,
    "sellPrice" DECIMAL(12,4),
    "sellDate" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "threshold" DECIMAL(12,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "code" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "error" TEXT,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_marketHashName_key" ON "Item"("marketHashName");

-- CreateIndex
CREATE INDEX "Item_type_idx" ON "Item"("type");

-- CreateIndex
CREATE INDEX "PriceSnapshot_itemId_ts_idx" ON "PriceSnapshot"("itemId", "ts");

-- CreateIndex
CREATE INDEX "PriceSnapshot_ts_idx" ON "PriceSnapshot"("ts");

-- CreateIndex
CREATE INDEX "PriceHistory_day_idx" ON "PriceHistory"("day");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_itemId_day_key" ON "PriceHistory"("itemId", "day");

-- CreateIndex
CREATE INDEX "OrderBook_itemId_ts_idx" ON "OrderBook"("itemId", "ts");

-- CreateIndex
CREATE INDEX "Position_itemId_idx" ON "Position"("itemId");

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBook" ADD CONSTRAINT "OrderBook_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
