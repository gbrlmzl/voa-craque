-- AlterTable
-- Sessoes ja abertas contam como "mantidas" (default true): o cookie delas ja era persistente.
ALTER TABLE "RefreshToken" ADD COLUMN     "persistent" BOOLEAN NOT NULL DEFAULT true;
