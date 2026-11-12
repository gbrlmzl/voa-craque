import { DELETE, POST } from "@/app/api/game-days/[id]/registrations/route";
import { prisma } from "@/lib/prisma";
import { subscribeGameDay } from "@/lib/realtime";
import { callRoute } from "../../helpers/route";
import {
  createGameDay,
  createPlayer,
  createTeams,
  ensureSettings,
  registerPlayers,
  registerUser,
} from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

const subscribe = (id: string, body: object) =>
  callRoute(POST, { method: "POST", params: { id }, body });
const unsubscribe = (id: string) => callRoute(DELETE, { method: "DELETE", params: { id } });

describe("POST /api/game-days/[id]/registrations", () => {
  it("visitante recebe 401", async () => {
    const gameDay = await createGameDay();
    asVisitor();
    expect((await subscribe(gameDay.id, { paymentMethod: "ON_SITE" })).status).toBe(401);
  });

  it("inscreve no local: pendente, sem comprovante, com o preco da pelada, auditado e publicado", async () => {
    const gameDay = await createGameDay({ pricePerPlayerCents: 1500 });
    const user = await createPlayer();
    await actAs(user);
    const events: string[] = [];
    const stop = subscribeGameDay(gameDay.id, (notice) => events.push(notice.reason));

    const res = await subscribe(gameDay.id, { paymentMethod: "ON_SITE" });
    stop();
    expect(res.status).toBe(200);

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: res.json.id } });
    expect(registration).toMatchObject({
      userId: user.id,
      gameDayId: gameDay.id,
      paymentMethod: "ON_SITE",
      paymentStatus: "PENDING",
      amountCents: 1500,
      receiptUrl: null,
    });
    expect(await prisma.auditLog.count({ where: { action: "REGISTRATION_CREATED", entityId: registration.id } })).toBe(1);
    expect(events).toEqual(["registration-created"]);
  });

  it("PIX com comprovante inscreve; sem comprovante e 400", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    const semComprovante = await subscribe(gameDay.id, { paymentMethod: "PIX" });
    expect(semComprovante.status).toBe(400);
    expect(semComprovante.json.error).toBe("Anexe o comprovante do PIX.");
    expect(await prisma.registration.count()).toBe(0);

    const ok = await subscribe(gameDay.id, { paymentMethod: "PIX", receiptUrl: "/api/files/comprovantes/x.png" });
    expect(ok.status).toBe(200);
    expect((await prisma.registration.findFirstOrThrow()).receiptUrl).toBe("/api/files/comprovantes/x.png");
  });

  it("forma de pagamento invalida: 422", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    const res = await subscribe(gameDay.id, { paymentMethod: "CARTAO" });
    expect(res.status).toBe(422);
    expect(res.json.details.paymentMethod).toBe("Escolha a forma de pagamento.");
  });

  it("inscricoes fechadas pelo sistema: 409", async () => {
    const gameDay = await createGameDay();
    await ensureSettings({ registrationOpen: false });
    await actAs(await createPlayer());
    const res = await subscribe(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("As inscrições estão fechadas no momento.");
  });

  it("pelada inexistente: 404", async () => {
    await actAs(await createPlayer());
    expect((await subscribe("nao-existe", { paymentMethod: "ON_SITE" })).status).toBe(404);
  });

  it.each(["TEAMS_SET", "LIVE", "FINISHED", "CANCELED"] as const)("pelada %s nao aceita inscricao", async (status) => {
    const gameDay = await createGameDay({ status });
    await actAs(await createPlayer());
    const res = await subscribe(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("As inscrições desta pelada já foram encerradas.");
  });

  it("inscricao duplicada: 409", async () => {
    const gameDay = await createGameDay();
    const user = await createPlayer();
    await registerUser(gameDay.id, user.id);
    await actAs(user);
    const res = await subscribe(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Você já está inscrito nesta pelada.");
  });

  it("lotada: 409", async () => {
    const gameDay = await createGameDay({ maxPlayers: 10 });
    await registerPlayers(gameDay.id, 10);
    await actAs(await createPlayer());
    const res = await subscribe(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("A pelada já está lotada.");
  });
});

describe("DELETE /api/game-days/[id]/registrations", () => {
  it("o jogador cancela a propria inscricao e a auditoria guarda o antes", async () => {
    const gameDay = await createGameDay();
    const user = await createPlayer();
    const registration = await registerUser(gameDay.id, user.id);
    await actAs(user);
    expect((await unsubscribe(gameDay.id)).status).toBe(200);
    expect(await prisma.registration.count()).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "REGISTRATION_CANCELLED" } });
    expect(audit.entityId).toBe(registration.id);
  });

  it("quem nao esta inscrito: 404", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    const res = await unsubscribe(gameDay.id);
    expect(res.status).toBe(404);
    expect(res.json.error).toBe("Você não está inscrito nesta pelada.");
  });

  it("depois dos times montados so o organizador mexe: 409", async () => {
    const { gameDay, players } = await createTeams();
    await actAs(players[0]);
    const res = await unsubscribe(gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Os times já foram montados. Fale com o organizador.");
    expect(await prisma.registration.count({ where: { gameDayId: gameDay.id } })).toBe(12);
  });

  it("nao cancela a inscricao de outra pessoa", async () => {
    const gameDay = await createGameDay();
    const [other] = await registerPlayers(gameDay.id, 1);
    await actAs(await createPlayer());
    expect((await unsubscribe(gameDay.id)).status).toBe(404);
    expect(await prisma.registration.count({ where: { userId: other.id } })).toBe(1);
  });
});
