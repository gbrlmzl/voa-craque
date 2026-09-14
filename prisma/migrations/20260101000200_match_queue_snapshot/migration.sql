-- Guarda a fila no momento em que a partida encerra, para o desfazer voltar tudo.
ALTER TABLE "Match" ADD COLUMN "queueSnapshot" JSONB;
