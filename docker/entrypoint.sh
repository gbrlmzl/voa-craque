#!/bin/sh
set -e

echo "[voacraque] aplicando migrations..."
npx prisma migrate deploy

echo "[voacraque] rodando seed..."
npx tsx prisma/seed.ts

echo "[voacraque] limpando refresh tokens e links de redefinicao expirados..."
npx tsx scripts/purge-tokens.ts || echo "[voacraque] purga falhou; seguindo"

echo "[voacraque] subindo aplicacao na porta 3000..."
exec npx next start -H 0.0.0.0 -p 3000
