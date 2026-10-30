-- AlterEnum
ALTER TYPE "GameDayStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "GameDay" ADD COLUMN     "canceledAt" TIMESTAMP(3);
