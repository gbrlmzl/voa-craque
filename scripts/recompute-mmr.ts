import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { recomputeAllRatings } from "@/services/rating";

/**
 * Recalcula o MMR de todo mundo a partir das peladas encerradas: apaga o extrato
 * e o estado atual e replica as peladas em ordem. E como se semeia a historia que
 * ja existe e como se aplica uma mudanca de constante em src/lib/mmr.ts.
 * Atencao: um ajuste manual de MMR (PATCH /api/players/[id]/mmr) e apagado por aqui.
 * Uso: npm run mmr:recompute
 */
async function main() {
  const result = await recomputeAllRatings(null, (line) => console.log(`[mmr] ${line}`));
  console.log(`[mmr] ${result.gameDays} peladas replicadas, ${result.players} jogadores com MMR`);

  const ratings = await prisma.playerRating.findMany({
    orderBy: [{ mmr: "desc" }, { userId: "asc" }],
    include: {
      user: { select: { username: true, profile: { select: { name: true, nickname: true, stars: true } } } },
    },
  });

  for (const rating of ratings) {
    const profile = rating.user.profile;
    const name = profile?.nickname || profile?.name || rating.user.username;
    const stars = profile?.stars === null || profile?.stars === undefined ? "  -" : `${profile.stars.toFixed(1)}★`;
    console.log(
      `[mmr] ${rating.mmr.toFixed(1).padStart(7)}  ${stars.padStart(4)}  ` +
        `${String(rating.gameDaysRated).padStart(2)} peladas  ${name}`,
    );
  }

  if (ratings.length === 0) return;
  const mmrs = ratings.map((rating) => rating.mmr);
  const average = mmrs.reduce((sum, value) => sum + value, 0) / mmrs.length;
  console.log(
    `[mmr] media ${average.toFixed(1)}, maior ${Math.max(...mmrs).toFixed(1)}, menor ${Math.min(...mmrs).toFixed(1)}`,
  );

  // Movimento medio por pelada em cada estrela: mostra quanto a estrela estica o ritmo.
  const changes = await prisma.ratingChange.findMany({ select: { starsUsed: true, delta: true } });
  const bands = new Map<string, number[]>();
  for (const change of changes) {
    const band = change.starsUsed === null ? "sem estrela" : `${Math.round(change.starsUsed)}★`;
    bands.set(band, [...(bands.get(band) ?? []), Math.abs(change.delta)]);
  }
  for (const [band, deltas] of [...bands.entries()].sort()) {
    const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    console.log(`[mmr] movimento medio por pelada, ${band}: ${mean.toFixed(1)} (${deltas.length} extratos)`);
  }
}

main()
  .catch((error) => {
    console.error("[mmr] falha ao recomputar", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
