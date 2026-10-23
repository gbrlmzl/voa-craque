-- MMR dos jogadores e extrato por pelada.
--
-- PlayerRating guarda o estado atual e RatingChange o extrato (uma linha por
-- jogador por pelada, com a decomposicao do movimento e a estrela do perfil que
-- valeu no fator de aposta). As colunas novas dizem se a pelada ja foi
-- contabilizada e quando o organizador mexeu na estrela do jogador pela ultima
-- vez. O MMR e so o placar do ranking: nao vira estrela nem entra no sorteio.
--
-- Sem backfill de proposito: as tabelas nascem vazias e a recomputacao
-- (npm run mmr:recompute) semeia a historia, porque a semeadura e a propria
-- formula rodando sobre as peladas encerradas.

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "starsUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GameDay" ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "ratingSkippedReason" TEXT;

-- CreateTable
CREATE TABLE "PlayerRating" (
    "userId" TEXT NOT NULL,
    "mmr" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "peakMmr" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "lowestMmr" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "gameDaysRated" INTEGER NOT NULL DEFAULT 0,
    "matchesRated" INTEGER NOT NULL DEFAULT 0,
    "lastDelta" DOUBLE PRECISION,
    "lastGameDayId" TEXT,
    "lastRatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRating_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RatingChange" (
    "id" TEXT NOT NULL,
    "gameDayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mmrBefore" DOUBLE PRECISION NOT NULL,
    "mmrAfter" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "resultDelta" DOUBLE PRECISION NOT NULL,
    "attackDelta" DOUBLE PRECISION NOT NULL,
    "defenseDelta" DOUBLE PRECISION NOT NULL,
    "normalizeDelta" DOUBLE PRECISION NOT NULL,
    "stakeFactor" DOUBLE PRECISION NOT NULL,
    "calibrationFactor" DOUBLE PRECISION NOT NULL,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "starsUsed" DOUBLE PRECISION,
    "matches" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "won" INTEGER NOT NULL,
    "drawn" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "conceded" INTEGER NOT NULL,
    "cleanSheets" INTEGER NOT NULL,
    "perMatch" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRating_mmr_idx" ON "PlayerRating"("mmr");

-- CreateIndex
CREATE INDEX "RatingChange_userId_createdAt_idx" ON "RatingChange"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatingChange_gameDayId_userId_key" ON "RatingChange"("gameDayId", "userId");

-- AddForeignKey
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_lastGameDayId_fkey" FOREIGN KEY ("lastGameDayId") REFERENCES "GameDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingChange" ADD CONSTRAINT "RatingChange_gameDayId_fkey" FOREIGN KEY ("gameDayId") REFERENCES "GameDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingChange" ADD CONSTRAINT "RatingChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o banco pode garantir (a escala de 600 a 1600 e a de estrelas de 1 a 5).
ALTER TABLE "PlayerRating"
  ADD CONSTRAINT "PlayerRating_mmr_range" CHECK ("mmr" >= 600 AND "mmr" <= 1600),
  ADD CONSTRAINT "PlayerRating_counts_non_negative" CHECK ("gameDaysRated" >= 0 AND "matchesRated" >= 0);

ALTER TABLE "RatingChange"
  ADD CONSTRAINT "RatingChange_starsUsed_range" CHECK ("starsUsed" IS NULL OR ("starsUsed" >= 1 AND "starsUsed" <= 5));
