#!/bin/sh
set -e

echo "[voacraque] aplicando migrations..."
npx prisma migrate deploy

echo "[voacraque] rodando seed..."
npx tsx prisma/seed.ts

echo "[voacraque] subindo aplicacao na porta 3000..."
exec npx next start -H 0.0.0.0 -p 3000
