-- O nome de verdade sai de User e vai para PlayerProfile (preenchido no
-- primeiro acesso); User ganha um username, coletado no cadastro.

-- AlterTable: User.username, preenchido a partir do e-mail antes do NOT NULL.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User"
SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9_.]', '_', 'g'))
WHERE "username" IS NULL;

-- Desempata usernames repetidos (ex.: mesmo prefixo de e-mail em domínios
-- diferentes) anexando um sufixo do próprio id, que é único.
UPDATE "User" u
SET "username" = u."username" || '_' || substr(u."id", 1, 6)
WHERE u."id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "username" ORDER BY "createdAt") AS rn
    FROM "User"
  ) ranked
  WHERE rn > 1
);

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AlterTable: PlayerProfile.name, herdado do User.name antes de o campo sumir.
ALTER TABLE "PlayerProfile" ADD COLUMN "name" TEXT;

UPDATE "PlayerProfile" p
SET "name" = u."name"
FROM "User" u
WHERE u."id" = p."userId";

ALTER TABLE "PlayerProfile" ALTER COLUMN "name" SET NOT NULL;

-- AlterTable: User perde o nome, que agora só existe no perfil de jogador.
ALTER TABLE "User" DROP COLUMN "name";
