import { POST as adminRegister } from "@/app/api/game-days/[id]/registrations/admin/route";
import { GET as candidates } from "@/app/api/game-days/[id]/registrations/candidates/route";
import { DELETE as removeRegistration, PATCH as decidePayment } from "@/app/api/game-days/[id]/registrations/[registrationId]/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import {
  createAdmin,
  createGameDay,
  createPlayer,
  createTeams,
  createUser,
  registerPlayers,
  registerUser,
  startLiveGameDay,
} from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const register = (id: string, body: object) =>
  callRoute(adminRegister, { method: "POST", params: { id }, body });

describe("POST .../registrations/admin", () => {
  it("jogador comum nao inscreve ninguem (403)", async () => {
    const gameDay = await createGameDay();
    const target = await createPlayer();
    await actAs(await createPlayer());
    expect((await register(gameDay.id, { userIds: [target.id], paymentMethod: "ON_SITE" })).status).toBe(403);
  });

  it("organizador inscreve varios, ja pagos, e cada um e auditado", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const [a, b] = [await createPlayer(), await createPlayer()];
    await actAs(admin);
    const res = await register(gameDay.id, { userIds: [a.id, b.id, a.id], paymentMethod: "PIX", alreadyPaid: true });
    expect(res.status).toBe(200);
    expect(res.json.asReserve).toBe(false);
    expect(res.json.created).toHaveLength(2);

    const rows = await prisma.registration.findMany({ where: { gameDayId: gameDay.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.paymentStatus === "CONFIRMED" && r.confirmedById === admin.id && r.confirmedAt)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "REGISTRATION_ADDED_BY_ADMIN" } })).toBe(2);
  });

  it("sem marcar 'ja pagou' o pagamento fica pendente", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const player = await createPlayer();
    await actAs(admin);
    await register(gameDay.id, { userIds: [player.id], paymentMethod: "ON_SITE" });
    expect((await prisma.registration.findFirstOrThrow()).paymentStatus).toBe("PENDING");
  });

  it("respeita as vagas restantes e explica quantas cabem", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id, maxPlayers: 10 });
    await registerPlayers(gameDay.id, 9);
    const extra = [await createPlayer(), await createPlayer()];
    await actAs(admin);
    const res = await register(gameDay.id, { userIds: extra.map((u) => u.id), paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Só cabe mais 1 jogador/);
    expect(await prisma.registration.count({ where: { gameDayId: gameDay.id } })).toBe(9);
  });

  it("pelada lotada: mensagem de lotacao", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id, maxPlayers: 10 });
    await registerPlayers(gameDay.id, 10);
    await actAs(admin);
    const res = await register(gameDay.id, { userIds: [(await createPlayer()).id], paymentMethod: "ON_SITE" });
    expect(res.json.error).toMatch(/está lotada \(10\/10\)/);
  });

  it("jogador ja inscrito: 409 com o nome", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const [already] = await registerPlayers(gameDay.id, 1);
    await actAs(admin);
    const res = await register(gameDay.id, { userIds: [already.id], paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/já está inscrito nesta pelada/);
  });

  it("conta desativada ou inexistente: 400", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const inactive = await createUser({ active: false });
    await actAs(admin);
    expect((await register(gameDay.id, { userIds: [inactive.id], paymentMethod: "ON_SITE" })).status).toBe(400);
    expect((await register(gameDay.id, { userIds: ["fantasma"], paymentMethod: "ON_SITE" })).status).toBe(400);
  });

  it("lista vazia: 422", async () => {
    const gameDay = await createGameDay();
    await actAs(await createAdmin());
    const res = await register(gameDay.id, { userIds: [], paymentMethod: "ON_SITE" });
    expect(res.status).toBe(422);
    expect(res.json.details.userIds).toBe("Escolha pelo menos um jogador.");
  });

  it("depois dos times montados entra como reserva", async () => {
    const { gameDay, admin } = await createTeams();
    const late = await createPlayer();
    await actAs(admin);
    const res = await register(gameDay.id, { userIds: [late.id], paymentMethod: "ON_SITE" });
    expect(res.json.asReserve).toBe(true);
    expect(await prisma.gameDayReserve.count({ where: { gameDayId: gameDay.id, userId: late.id } })).toBe(1);
  });

  it("encerrada ou cancelada nao inscreve", async () => {
    const admin = await createAdmin();
    await actAs(admin);
    const finished = await createGameDay({ status: "FINISHED" });
    const canceled = await createGameDay({ status: "CANCELED" });
    const player = await createPlayer();
    expect((await register(finished.id, { userIds: [player.id], paymentMethod: "ON_SITE" })).json.error).toBe("Esta pelada já foi encerrada.");
    expect((await register(canceled.id, { userIds: [player.id], paymentMethod: "ON_SITE" })).json.error).toBe("Esta pelada foi cancelada.");
  });
});

describe("GET .../registrations/candidates", () => {
  it("lista quem esta ativo e ainda nao se inscreveu, em ordem alfabetica", async () => {
    const admin = await createAdmin({ profile: { name: "Zeca" } });
    const gameDay = await createGameDay({ createdById: admin.id });
    await createPlayer({ profile: { name: "Bruno" } });
    await createPlayer({ profile: { name: "Ana" } });
    await createPlayer({ active: false, profile: { name: "Inativo" } });
    const registered = await createPlayer({ profile: { name: "Ja Inscrito" } });
    await registerUser(gameDay.id, registered.id);
    await createUser({ username: "semperfil", profile: false });

    await actAs(admin);
    const res = await callRoute(candidates, { params: { id: gameDay.id } });
    expect(res.status).toBe(200);
    const names = res.json.candidates.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Ana", "Bruno", "semperfil", "Zeca"]);
    expect(res.json.candidates.find((c: { name: string }) => c.name === "semperfil").profileCompleted).toBe(false);
  });

  it("jogador comum: 403; pelada inexistente: 404", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    expect((await callRoute(candidates, { params: { id: gameDay.id } })).status).toBe(403);
    await actAs(await createAdmin());
    expect((await callRoute(candidates, { params: { id: "nao-existe" } })).status).toBe(404);
  });
});

describe("PATCH .../registrations/[registrationId] (pagamento)", () => {
  const decide = (id: string, registrationId: string, body: object) =>
    callRoute(decidePayment, { method: "PATCH", params: { id, registrationId }, body });

  it("aprova: confirma, guarda quem e quando e audita", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const user = await createPlayer();
    const registration = await registerUser(gameDay.id, user.id, { method: "PIX" });
    await actAs(admin);
    expect((await decide(gameDay.id, registration.id, { paymentStatus: "CONFIRMED" })).status).toBe(200);
    const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after).toMatchObject({ paymentStatus: "CONFIRMED", confirmedById: admin.id });
    expect(after.confirmedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "PAYMENT_CONFIRMED" } })).toBe(1);
  });

  it("rejeita com motivo e limpa a confirmacao", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const user = await createPlayer();
    const registration = await registerUser(gameDay.id, user.id, { method: "PIX", status: "CONFIRMED" });
    await actAs(admin);
    await decide(gameDay.id, registration.id, { paymentStatus: "REJECTED", rejectedReason: "Valor errado" });
    const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after).toMatchObject({ paymentStatus: "REJECTED", rejectedReason: "Valor errado", confirmedById: null, confirmedAt: null });
    expect(await prisma.auditLog.count({ where: { action: "PAYMENT_REJECTED" } })).toBe(1);
  });

  it("voltar para pendente limpa motivo e confirmacao", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const user = await createPlayer();
    const registration = await registerUser(gameDay.id, user.id, { method: "PIX", status: "REJECTED" });
    await prisma.registration.update({ where: { id: registration.id }, data: { rejectedReason: "x" } });
    await actAs(admin);
    await decide(gameDay.id, registration.id, { paymentStatus: "PENDING" });
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).toMatchObject({
      paymentStatus: "PENDING",
      rejectedReason: null,
    });
    expect(await prisma.auditLog.count({ where: { action: "PAYMENT_RESET" } })).toBe(1);
  });

  it("inscricao de outra pelada: 404; jogador comum: 403; status invalido: 422", async () => {
    const admin = await createAdmin();
    const [gameDay, other] = [await createGameDay({ createdById: admin.id }), await createGameDay({ createdById: admin.id })];
    const user = await createPlayer();
    const registration = await registerUser(other.id, user.id);
    await actAs(admin);
    expect((await decide(gameDay.id, registration.id, { paymentStatus: "CONFIRMED" })).status).toBe(404);
    expect((await decide(other.id, registration.id, { paymentStatus: "TALVEZ" })).status).toBe(422);
    await actAs(user);
    expect((await decide(other.id, registration.id, { paymentStatus: "CONFIRMED" })).status).toBe(403);
  });
});

describe("DELETE .../registrations/[registrationId]", () => {
  const remove = (id: string, registrationId: string) =>
    callRoute(removeRegistration, { method: "DELETE", params: { id, registrationId } });

  it("organizador remove a inscricao e a vaga de reserva", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const user = await createPlayer();
    const registration = await registerUser(gameDay.id, user.id);
    await prisma.gameDayReserve.create({ data: { gameDayId: gameDay.id, userId: user.id } });
    await actAs(admin);
    expect((await remove(gameDay.id, registration.id)).status).toBe(200);
    expect(await prisma.registration.count()).toBe(0);
    expect(await prisma.gameDayReserve.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "REGISTRATION_REMOVED_BY_ADMIN" } })).toBe(1);
  });

  it("quem esta num time nao sai: 409 mandando refazer os times", async () => {
    const { gameDay, admin, players } = await createTeams();
    const registration = await prisma.registration.findFirstOrThrow({ where: { gameDayId: gameDay.id, userId: players[0].id } });
    await actAs(admin);
    const res = await remove(gameDay.id, registration.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Refazer times/);
  });

  it("quem ja jogou nao sai: 409", async () => {
    const { gameDay, admin, players } = await startLiveGameDay();
    const player = await prisma.matchPlayer.findFirstOrThrow({ where: { match: { gameDayId: gameDay.id } } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { gameDayId: gameDay.id, userId: player.userId } });
    await prisma.teamPlayer.deleteMany({ where: { userId: player.userId } });
    await actAs(admin);
    const res = await remove(gameDay.id, registration.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/já jogou nesta pelada/);
    expect(players.length).toBe(12);
  });

  it("inscricao inexistente ou de outra pelada: 404; encerrada: 409", async () => {
    const admin = await createAdmin();
    const gameDay = await createGameDay({ createdById: admin.id });
    const finished = await createGameDay({ createdById: admin.id, status: "FINISHED" });
    const user = await createPlayer();
    const old = await registerUser(finished.id, user.id);
    await actAs(admin);
    expect((await remove(gameDay.id, "fantasma")).status).toBe(404);
    expect((await remove(gameDay.id, old.id)).status).toBe(404);
    expect((await remove(finished.id, old.id)).status).toBe(409);
  });
});
