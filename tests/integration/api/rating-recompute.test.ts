import { POST } from "@/app/api/admin/rating/recompute/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createAdmin, createSuperadmin, finishGameDay } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const recompute = () => callRoute(POST, { method: "POST" });

describe("POST /api/admin/rating/recompute", () => {
  it("so o superadmin (403 para organizador, 401 para visitante)", async () => {
    await actAs(await createAdmin());
    expect((await recompute()).status).toBe(403);
  });

  it("recomputar duas vezes da o mesmo resultado, mesmo apos um ajuste manual (que e apagado)", async () => {
    await finishGameDay();
    const snapshot = async () =>
      (await prisma.playerRating.findMany({ orderBy: { userId: "asc" } })).map((r) => [r.userId, r.mmr, r.peakMmr, r.gameDaysRated]);
    const original = await snapshot();
    const changes = await prisma.ratingChange.count();

    await prisma.playerRating.updateMany({ data: { mmr: 1234 } });
    await actAs(await createSuperadmin());
    const first = await recompute();
    expect(first.status).toBe(200);
    expect(first.json).toEqual({ gameDays: 1, players: original.length });
    expect(await snapshot()).toEqual(original);

    expect((await recompute()).status).toBe(200);
    expect(await snapshot()).toEqual(original);
    expect(await prisma.ratingChange.count()).toBe(changes);
    expect(await prisma.auditLog.count({ where: { action: "RATING_RECOMPUTED" } })).toBe(2);
  });

  it("sem peladas encerradas: zera tudo e responde 0 e 0", async () => {
    await actAs(await createSuperadmin());
    expect((await recompute()).json).toEqual({ gameDays: 0, players: 0 });
  });
});
