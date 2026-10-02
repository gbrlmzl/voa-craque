-- Escalacao por partida e substituicoes.
--
-- TeamPlayer (elenco fixo do time na pelada) servia ao mesmo tempo de lista do
-- painel, de validacao de gol e de base das estatisticas, que sao recalculadas
-- a partir dele. Trocar alguem no meio da pelada reescreveria o historico.
-- MatchPlayer passa a registrar quem jogou cada partida; MatchSubstitution
-- registra as trocas (lances, auditoria e desfazer).

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isKeeper" BOOLEAN NOT NULL DEFAULT false,
    "starter" BOOLEAN NOT NULL DEFAULT true,
    "onCourt" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSubstitution" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "outUserId" TEXT NOT NULL,
    "inUserId" TEXT NOT NULL,
    "fromTeamId" TEXT,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "elapsedMs" INTEGER NOT NULL,
    "rosterBefore" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE INDEX "MatchSubstitution_matchId_createdAt_idx" ON "MatchSubstitution"("matchId", "createdAt");

-- Backfill: ja existem partidas do beta em producao e as estatisticas passam a
-- ler MatchPlayer. Cada partida recebe uma linha por jogador do elenco atual do
-- mandante e do visitante, todos titulares e em quadra. Se algum dado antigo
-- tiver o mesmo jogador nos dois times, o do mandante prevalece em vez de
-- derrubar a migration pelo indice unico.
INSERT INTO "MatchPlayer" ("id", "matchId", "teamId", "userId", "isKeeper", "starter", "onCourt")
SELECT gen_random_uuid()::text, m."id", tp."teamId", tp."userId", tp."isKeeper", true, true
FROM "Match" m
JOIN "TeamPlayer" tp ON tp."teamId" IN (m."homeTeamId", m."awayTeamId")
ORDER BY m."id", (tp."teamId" = m."homeTeamId") DESC
ON CONFLICT ("matchId", "userId") DO NOTHING;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_outUserId_fkey" FOREIGN KEY ("outUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_inUserId_fkey" FOREIGN KEY ("inUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de negocio tambem no banco, como em 20260101000100_constraints.
ALTER TABLE "MatchSubstitution"
  ADD CONSTRAINT "MatchSubstitution_elapsed_non_negative" CHECK ("elapsedMs" >= 0),
  ADD CONSTRAINT "MatchSubstitution_distinct_players" CHECK ("outUserId" <> "inUserId");
