import { POST } from "@/app/api/matches/[id]/substitutions/route";
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
    expect((await undo(match.id, json.substitutionId)).status).toBe(200);
    expect((await prisma.matchPlayer.findFirstOrThrow({ where: { matchId: match.id, userId: out } })).onCourt).toBe(true);
    expect(await prisma.matchPlayer.count({ where: { matchId: match.id, userId: reserveId } })).toBe(0);
    expect(await prisma.matchSubstitution.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_SUBSTITUTION_UNDONE" } })).toBe(1);
  });

  it("desfazer troca permanente restaura o elenco fixo", async () => {
    const { match, gameDay, reserveId } = await liveWithReserve();
    const out = match.homeTeam.players[0].userId;
    const { json } = await substitute(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserveId, permanent: true });
    await undo(match.id, json.substitutionId);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: out } })).toBe(1);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: reserveId } })).toBe(0);
    expect(await prisma.gameDayReserve.findMany({ where: { gameDayId: gameDay.id } })).toEqual([expect.objectContaining({ userId: reserveId })]);
  });

  it("so a ultima troca pode ser desfeita (409)", async () => {
    const { match, reserveId } = await liveWithReserve();
    const [a, b] = match.homeTeam.players;
    const first = await substitute(match.id, { teamId: match.homeTeamId, outUserId: a.userId, inUserId: reserveId });
    await substitute(match.id, { teamId: match.homeTeamId, outUserId: b.userId, inUserId: a.userId });
    const res = await undo(match.id, first.json.substitutionId);
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
    const res = await undo(match.id, json.substitutionId);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Desfaça antes o lance de/);
  });

  it("substituicao inexistente: 404", async () => {
    const { match } = await liveWithReserve();
    expect((await undo(match.id, "fantasma")).status).toBe(404);
  });
});
