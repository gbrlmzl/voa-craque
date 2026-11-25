import { DELETE as DELETE_BATCH, POST } from "@/app/api/matches/[id]/substitutions/route";
import { DELETE } from "@/app/api/matches/[id]/substitutions/[substitutionId]/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createPlayer, currentMatch, startLiveGameDay, whistle } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

async function liveWithReserve() {
  const live = await startLiveGameDay({ players: 13, goalsToWin: 5 });
  const match = await currentMatch(live.gameDay.id);
  await whistle(match.id, live.admin);
  await actAs(live.admin);
  const reserve = await prisma.gameDayReserve.findFirstOrThrow({ where: { gameDayId: live.gameDay.id } });
  return { ...live, match, reserveId: reserve.userId };
}

const substitute = (matchId: string, body: object) =>
  callRoute(POST, { method: "POST", params: { id: matchId }, body });
const undo = (matchId: string, substitutionId: string) =>
  callRoute(DELETE, { method: "DELETE", params: { id: matchId, substitutionId } });
const undoBatch = (matchId: string, ids: string[]) =>
  callRoute(DELETE_BATCH, { method: "DELETE", path: `/?ids=${ids.join(",")}`, params: { id: matchId } });
const swapsOf = (outs: string[], ins: string[]) => outs.map((outUserId, i) => ({ outUserId, inUserId: ins[i] }));

describe("POST /api/matches/[id]/substitutions", () => {
  it("troca volante: o reserva entra, quem saiu fica no banco, o relogio nao para", async () => {
    const { match, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    const res = await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId });
    expect(res.status).toBe(200);

    const lineup = await prisma.matchPlayer.findMany({ where: { matchId: match.id, userId: { in: [out, reserveId] } } });
    expect(lineup.find((p) => p.userId === out)?.onCourt).toBe(false);
    expect(lineup.find((p) => p.userId === reserveId)).toMatchObject({ onCourt: true, starter: false, teamId: match.homeTeamId });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe("RUNNING");
    const substitution = await prisma.matchSubstitution.findFirstOrThrow({ where: { matchId: match.id } });
    expect(substitution.permanent).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_SUBSTITUTION" } })).toBe(1);
    // o elenco fixo nao mudou
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: out } })).toBe(1);
  });

  it("troca permanente: o reserva vira do time e quem saiu vira reserva", async () => {
    const { match, gameDay, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    expect((await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId, permanent: true })).status).toBe(200);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: reserveId } })).toBe(1);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: out } })).toBe(0);
    expect(await prisma.gameDayReserve.findMany({ where: { gameDayId: gameDay.id } })).toEqual([expect.objectContaining({ userId: out })]);
  });

  it("jogador ja em quadra, quem sai fora de quadra e a mesma pessoa: 400", async () => {
    const { match, reserveId } = await liveWithReserve();
    const [a, b] = match.homeTeam.players;
    expect((await substitute(match.id, { teamId: match.homeTeamId, outUserId: a.userId, inUserId: b.userId })).json.error).toBe("Quem entra já está em quadra.");
    expect((await substitute(match.id, { teamId: match.homeTeamId, outUserId: reserveId, inUserId: a.userId })).json.error).toBe("Quem sai não está em quadra por este time.");
    expect((await substitute(match.id, { teamId: match.homeTeamId, outUserId: a.userId, inUserId: a.userId })).json.error).toBe(
      "Quem sai e quem entra precisam ser jogadores diferentes.",
    );
    expect((await substitute(match.id, { teamId: "outro", outUserId: a.userId, inUserId: reserveId })).status).toBe(400);
  });

  it("quem saiu pode voltar (reentrada) e a linha antiga e reaproveitada", async () => {
    const { match, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId });
    expect((await substitute(match.id, { teamId: match.homeTeamId, outUserId: reserveId, inUserId: out })).status).toBe(200);
    expect(await prisma.matchPlayer.count({ where: { matchId: match.id, userId: out } })).toBe(1);
    expect((await prisma.matchPlayer.findFirstOrThrow({ where: { matchId: match.id, userId: out } })).onCourt).toBe(true);
  });

  it("partida encerrada: 409; so organizador: 403; corpo incompleto: 422", async () => {
    const { match, reserveId, admin } = await liveWithReserve();
    const body = { teamId: match.homeTeamId, outUserId: match.homeTeam.players[0].userId, inUserId: reserveId };
    expect((await substitute(match.id, { teamId: match.homeTeamId })).status).toBe(422);
    await actAs(await createPlayer());
    expect((await substitute(match.id, body)).status).toBe(403);
    await actAs(admin);
    await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED" } });
    expect((await substitute(match.id, body)).json.error).toBe("A partida já foi encerrada.");
    expect((await substitute("fantasma", body)).status).toBe(404);
  });
});

describe("DELETE /api/matches/[id]/substitutions/[substitutionId]", () => {
  it("desfaz a ultima troca e devolve a escalacao", async () => {
    const { match, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    const { json } = await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId });
    expect((await undo(match.id, json.substitutionIds[0])).status).toBe(200);
    expect((await prisma.matchPlayer.findFirstOrThrow({ where: { matchId: match.id, userId: out } })).onCourt).toBe(true);
    expect(await prisma.matchPlayer.count({ where: { matchId: match.id, userId: reserveId } })).toBe(0);
    expect(await prisma.matchSubstitution.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_SUBSTITUTION_UNDONE" } })).toBe(1);
  });

  it("desfazer troca permanente restaura o elenco fixo", async () => {
    const { match, gameDay, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    const { json } = await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId, permanent: true });
    await undo(match.id, json.substitutionIds[0]);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: out } })).toBe(1);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: reserveId } })).toBe(0);
    expect(await prisma.gameDayReserve.findMany({ where: { gameDayId: gameDay.id } })).toEqual([expect.objectContaining({ userId: reserveId })]);
  });

  it("so a ultima troca pode ser desfeita (409)", async () => {
    const { match, reserveId } = await liveWithReserve();
    const [a, b] = match.homeTeam.players;
    const first = await substitute(match.id, { teamId: match.homeTeamId, outUserId: a.userId, inUserId: reserveId });
    await substitute(match.id, { teamId: match.homeTeamId, outUserId: b.userId, inUserId: a.userId });
    const res = await undo(match.id, first.json.substitutionIds[0]);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Só dá para desfazer a última substituição da partida.");
  });

  it("quem entrou ja marcou gol: desfazer o lance antes (409)", async () => {
    const { match, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    const { json } = await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId });
    await callRoute((await import("@/app/api/matches/[id]/events/route")).POST, {
      method: "POST",
      params: { id: match.id },
      body: { type: "GOAL", userId: reserveId, teamId: match.homeTeamId },
    });
    const res = await undo(match.id, json.substitutionIds[0]);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Desfaça antes o lance de/);
  });

  it("substituicao inexistente: 404", async () => {
    const { match } = await liveWithReserve();
    expect((await undo(match.id, "fantasma")).status).toBe(404);
  });
});

// Varios jogadores do mesmo time de uma vez. Reserva so existe com mais gente do que cabe nos times.
async function liveWithBench(players: number) {
  const live = await startLiveGameDay({ players, goalsToWin: 5 });
  const match = await currentMatch(live.gameDay.id);
  await whistle(match.id, live.admin);
  await actAs(live.admin);
  const reserves = (await prisma.gameDayReserve.findMany({ where: { gameDayId: live.gameDay.id }, orderBy: { createdAt: "asc" } })).map(
    (row) => row.userId,
  );
  const waiting = await prisma.team.findMany({
    where: { gameDayId: live.gameDay.id, id: { notIn: [match.homeTeamId, match.awayTeamId] } },
    include: { players: true },
    orderBy: { queuePosition: "asc" },
  });
  return { ...live, match, reserves, waiting };
}

const lineupOf = (matchId: string) => prisma.matchPlayer.findMany({ where: { matchId }, orderBy: { userId: "asc" } });

describe("POST /api/matches/[id]/substitutions: varios jogadores de uma vez", () => {
  it("troca dois de uma vez: o 1o que sai e o 1o que entra formam o par, e a vaga de goleiro vai junto", async () => {
    const { match, reserves } = await liveWithBench(15);
    expect(reserves.length).toBeGreaterThanOrEqual(2);
    const keeper = match.homeTeam.players.find((player) => player.isKeeper) ?? match.homeTeam.players[0];
    const other = match.homeTeam.players.find((player) => player.userId !== keeper.userId)!;
    const before = await lineupOf(match.id);

    const res = await substitute(match.id, {
      teamId: match.homeTeamId,
      swaps: swapsOf([keeper.userId, other.userId], [reserves[0], reserves[1]]),
    });
    expect(res.status).toBe(200);
    expect(res.json.substitutionIds).toHaveLength(2);

    const lineup = await lineupOf(match.id);
    const row = (userId: string) => lineup.find((player) => player.userId === userId)!;
    expect([row(keeper.userId).onCourt, row(other.userId).onCourt]).toEqual([false, false]);
    expect(row(reserves[0])).toMatchObject({ onCourt: true, starter: false, teamId: match.homeTeamId });
    expect(row(reserves[1])).toMatchObject({ onCourt: true, starter: false, teamId: match.homeTeamId });
    expect(row(reserves[0]).isKeeper).toBe(before.find((player) => player.userId === keeper.userId)!.isKeeper);
    expect(row(reserves[1]).isKeeper).toBe(before.find((player) => player.userId === other.userId)!.isKeeper);

    const rows = await prisma.matchSubstitution.findMany({ where: { matchId: match.id } });
    expect(rows.map(({ outUserId, inUserId }) => [outUserId, inUserId]).sort()).toEqual(
      [
        [keeper.userId, reserves[0]],
        [other.userId, reserves[1]],
      ].sort(),
    );
    expect(rows.every((substitution) => !substitution.permanent)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_SUBSTITUTION" } })).toBe(2);
    // o elenco fixo nao mudou
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: { in: [keeper.userId, other.userId] } } })).toBe(2);
  });

  it("troca tres de uma vez", async () => {
    const { match, reserves } = await liveWithBench(15);
    expect(reserves.length).toBeGreaterThanOrEqual(3);
    const outs = match.homeTeam.players.slice(0, 3).map((player) => player.userId);
    const res = await substitute(match.id, { teamId: match.homeTeamId, swaps: swapsOf(outs, reserves.slice(0, 3)) });
    expect(res.status).toBe(200);
    expect(res.json.substitutionIds).toHaveLength(3);
    const onCourt = (await lineupOf(match.id)).filter((player) => player.onCourt && player.teamId === match.homeTeamId).map((p) => p.userId);
    expect(onCourt).toEqual(expect.arrayContaining(reserves.slice(0, 3)));
    expect(onCourt).toEqual(expect.not.arrayContaining(outs));
  });

  it("tudo ou nada: se um par e recusado, nenhum e aplicado", async () => {
    const { match, reserves } = await liveWithBench(15);
    const [a, b] = match.homeTeam.players;
    const before = await lineupOf(match.id);

    // o 2o par poe em quadra quem ja esta em quadra
    const res = await substitute(match.id, {
      teamId: match.homeTeamId,
      swaps: [
        { outUserId: a.userId, inUserId: reserves[0] },
        { outUserId: match.homeTeam.players[2].userId, inUserId: b.userId },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Quem entra já está em quadra.");
    expect(await lineupOf(match.id)).toEqual(before);
    expect(await prisma.matchSubstitution.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_SUBSTITUTION" } })).toBe(0);
  });

  it("o mesmo jogador nao sai nem entra duas vezes no mesmo pedido: 400", async () => {
    const { match, reserves } = await liveWithBench(15);
    const [a, b] = match.homeTeam.players;
    const sameOut = await substitute(match.id, {
      teamId: match.homeTeamId,
      swaps: [
        { outUserId: a.userId, inUserId: reserves[0] },
        { outUserId: a.userId, inUserId: reserves[1] },
      ],
    });
    expect(sameOut.status).toBe(400);
    expect(sameOut.json.error).toBe("O mesmo jogador não pode sair duas vezes.");
    const sameIn = await substitute(match.id, {
      teamId: match.homeTeamId,
      swaps: [
        { outUserId: a.userId, inUserId: reserves[0] },
        { outUserId: b.userId, inUserId: reserves[0] },
      ],
    });
    expect(sameIn.json.error).toBe("O mesmo jogador não pode entrar duas vezes.");
    expect(await prisma.matchSubstitution.count()).toBe(0);
  });

  it("lista de pares vazia ou grande demais: 422", async () => {
    const { match, reserves } = await liveWithBench(15);
    expect((await substitute(match.id, { teamId: match.homeTeamId, swaps: [] })).status).toBe(422);
    const many = Array.from({ length: 11 }, (_, i) => ({ outUserId: `s${i}`, inUserId: reserves[0] }));
    expect((await substitute(match.id, { teamId: match.homeTeamId, swaps: many })).status).toBe(422);
  });

  it("troca permanente de dois: os dois entram no elenco e quem saiu vai para as reservas", async () => {
    const { match, gameDay, reserves } = await liveWithBench(15);
    const outs = match.homeTeam.players.slice(0, 2).map((player) => player.userId);
    const res = await substitute(match.id, {
      teamId: match.homeTeamId,
      permanent: true,
      swaps: swapsOf(outs, reserves.slice(0, 2)),
    });
    expect(res.status).toBe(200);
    const roster = (await prisma.teamPlayer.findMany({ where: { teamId: match.homeTeamId } })).map((row) => row.userId);
    expect(roster).toEqual(expect.arrayContaining(reserves.slice(0, 2)));
    expect(roster).toEqual(expect.not.arrayContaining(outs));
    const nowReserves = (await prisma.gameDayReserve.findMany({ where: { gameDayId: gameDay.id } })).map((row) => row.userId);
    expect(nowReserves).toEqual(expect.arrayContaining(outs));
    expect(nowReserves).toEqual(expect.not.arrayContaining(reserves.slice(0, 2)));
  });

  it("permanente com dois do mesmo time da fila: o segundo par ve o elenco que o primeiro deixou", async () => {
    const { match, waiting } = await liveWithBench(18);
    expect(waiting.length).toBeGreaterThanOrEqual(1);
    const queueTeam = waiting[0];
    const outs = match.homeTeam.players.slice(0, 2).map((player) => player.userId);
    const ins = queueTeam.players.slice(0, 2).map((player) => player.userId);

    const res = await substitute(match.id, { teamId: match.homeTeamId, permanent: true, swaps: swapsOf(outs, ins) });
    expect(res.status).toBe(200);

    const homeRoster = (await prisma.teamPlayer.findMany({ where: { teamId: match.homeTeamId } })).map((row) => row.userId);
    const queueRoster = (await prisma.teamPlayer.findMany({ where: { teamId: queueTeam.id } })).map((row) => row.userId);
    expect(homeRoster).toEqual(expect.arrayContaining(ins));
    expect(homeRoster).toEqual(expect.not.arrayContaining(outs));
    expect(queueRoster).toEqual(expect.arrayContaining(outs));
    expect(queueRoster).toEqual(expect.not.arrayContaining(ins));
    expect(homeRoster).toHaveLength(match.homeTeam.players.length);
    expect(queueRoster).toHaveLength(queueTeam.players.length);
  });
});

describe("DELETE /api/matches/[id]/substitutions?ids=", () => {
  it("desfaz o lote inteiro e devolve a escalacao", async () => {
    const { match, reserves } = await liveWithBench(15);
    const outs = match.homeTeam.players.slice(0, 2).map((player) => player.userId);
    const before = await lineupOf(match.id);
    const { json } = await substitute(match.id, { teamId: match.homeTeamId, swaps: swapsOf(outs, reserves.slice(0, 2)) });

    expect((await undoBatch(match.id, json.substitutionIds)).status).toBe(200);
    expect(await lineupOf(match.id)).toEqual(before);
    expect(await prisma.matchSubstitution.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_SUBSTITUTION_UNDONE" } })).toBe(2);
  });

  it("desfazer um lote permanente restaura os dois elencos", async () => {
    const { match, gameDay, waiting } = await liveWithBench(18);
    const queueTeam = waiting[0];
    const outs = match.homeTeam.players.slice(0, 2).map((player) => player.userId);
    const ins = queueTeam.players.slice(0, 2).map((player) => player.userId);
    const rosterOf = async (teamId: string) =>
      (await prisma.teamPlayer.findMany({ where: { teamId }, orderBy: { userId: "asc" } })).map((row) => [row.userId, row.isKeeper, row.strength]);
    const [homeBefore, queueBefore] = [await rosterOf(match.homeTeamId), await rosterOf(queueTeam.id)];
    const reservesBefore = await prisma.gameDayReserve.count({ where: { gameDayId: gameDay.id } });
    const strengthBefore = (await prisma.team.findMany({ where: { id: { in: [match.homeTeamId, queueTeam.id] } }, orderBy: { id: "asc" } })).map((t) => t.averageStrength);

    const { json } = await substitute(match.id, { teamId: match.homeTeamId, permanent: true, swaps: swapsOf(outs, ins) });
    expect((await undoBatch(match.id, json.substitutionIds)).status).toBe(200);

    expect(await rosterOf(match.homeTeamId)).toEqual(homeBefore);
    expect(await rosterOf(queueTeam.id)).toEqual(queueBefore);
    expect(await prisma.gameDayReserve.count({ where: { gameDayId: gameDay.id } })).toBe(reservesBefore);
    expect((await prisma.team.findMany({ where: { id: { in: [match.homeTeamId, queueTeam.id] } }, orderBy: { id: "asc" } })).map((t) => t.averageStrength)).toEqual(strengthBefore);
  });

  it("so desfaz o que e a ultima parte: com uma troca depois do lote, 409 e nada muda", async () => {
    const { match, reserves } = await liveWithBench(15);
    const [a, b, c] = match.homeTeam.players;
    const batch = await substitute(match.id, { teamId: match.homeTeamId, swaps: swapsOf([a.userId, b.userId], reserves.slice(0, 2)) });
    await substitute(match.id, { teamId: match.homeTeamId, outUserId: c.userId, inUserId: reserves[2] });
    const before = await lineupOf(match.id);

    const res = await undoBatch(match.id, batch.json.substitutionIds);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Só dá para desfazer a última substituição da partida.");
    expect(await lineupOf(match.id)).toEqual(before);
    expect(await prisma.matchSubstitution.count()).toBe(3);
  });

  it("quem entrou por um dos pares ja marcou gol: 409 e o lote todo continua valendo", async () => {
    const { match, reserves } = await liveWithBench(15);
    const outs = match.homeTeam.players.slice(0, 2).map((player) => player.userId);
    const { json } = await substitute(match.id, { teamId: match.homeTeamId, swaps: swapsOf(outs, reserves.slice(0, 2)) });
    await callRoute((await import("@/app/api/matches/[id]/events/route")).POST, {
      method: "POST",
      params: { id: match.id },
      body: { type: "GOAL", userId: reserves[0], teamId: match.homeTeamId },
    });
    const before = await lineupOf(match.id);

    const res = await undoBatch(match.id, json.substitutionIds);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Desfaça antes o lance de/);
    expect(await lineupOf(match.id)).toEqual(before);
    expect(await prisma.matchSubstitution.count()).toBe(2);
  });

  it("ids ausentes: 422; id que nao e da partida: 404", async () => {
    const { match } = await liveWithBench(15);
    expect((await callRoute(DELETE_BATCH, { method: "DELETE", params: { id: match.id } })).status).toBe(422);
    expect((await undoBatch(match.id, ["fantasma"])).status).toBe(404);
  });
});
