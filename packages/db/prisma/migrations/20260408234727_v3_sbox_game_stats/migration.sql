-- CreateTable
CREATE TABLE "SboxGameStat" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "timeframe" TEXT NOT NULL,
    "usdRevenue" DECIMAL(14,2) NOT NULL,
    "units" INTEGER NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SboxGameStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SboxGameStat_scrapedAt_idx" ON "SboxGameStat"("scrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SboxGameStat_itemId_timeframe_key" ON "SboxGameStat"("itemId", "timeframe");

-- AddForeignKey
ALTER TABLE "SboxGameStat" ADD CONSTRAINT "SboxGameStat_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
