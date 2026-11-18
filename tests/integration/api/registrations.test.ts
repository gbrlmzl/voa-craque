import { DELETE, PATCH, POST } from "@/app/api/game-days/[id]/registrations/route";
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
const changeMethod = (id: string, body: object) => callRoute(PATCH, { method: "PATCH", params: { id }, body });

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

describe("PATCH /api/game-days/[id]/registrations (trocar a forma de pagamento)", () => {
  const RECEIPT = "/api/files/comprovantes/novo.png";

  /** Jogador inscrito e logado; `patch` ajusta o estado do pagamento antes do teste. */
  async function enrolled(
    input: Parameters<typeof registerUser>[2] & { receiptUrl?: string | null; rejectedReason?: string } = {},
    gameDayInput: Parameters<typeof createGameDay>[0] = {},
  ) {
    const gameDay = await createGameDay(gameDayInput);
    const user = await createPlayer();
    const { receiptUrl, rejectedReason, ...options } = input;
    const registration = await registerUser(gameDay.id, user.id, options);
    if (receiptUrl !== undefined || rejectedReason) {
      await prisma.registration.update({
        where: { id: registration.id },
        data: { ...(receiptUrl !== undefined ? { receiptUrl } : {}), rejectedReason: rejectedReason ?? null },
      });
    }
    await actAs(user);
    return { gameDay, user, registration };
  }
  const reload = (id: string) => prisma.registration.findUniqueOrThrow({ where: { id } });

  it("visitante recebe 401", async () => {
    const gameDay = await createGameDay();
    asVisitor();
    expect((await changeMethod(gameDay.id, { paymentMethod: "PIX" })).status).toBe(401);
  });

  it("no local passa para PIX com o comprovante novo, volta para aguardando, e e auditado e publicado", async () => {
    const { gameDay, registration } = await enrolled({ method: "ON_SITE", status: "REJECTED", rejectedReason: "Nao recebi" });
    const events: string[] = [];
    const stop = subscribeGameDay(gameDay.id, (notice) => events.push(notice.reason));

    const res = await changeMethod(gameDay.id, { paymentMethod: "PIX", receiptUrl: RECEIPT });
    stop();
    expect(res.status).toBe(200);

    expect(await reload(registration.id)).toMatchObject({
      paymentMethod: "PIX",
      paymentStatus: "PENDING",
      receiptUrl: RECEIPT,
      rejectedReason: null,
      confirmedById: null,
      confirmedAt: null,
      amountCents: registration.amountCents,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "REGISTRATION_PAYMENT_METHOD_CHANGED" } });
    expect(audit.entityId).toBe(registration.id);
    expect(audit.before).toMatchObject({ paymentMethod: "ON_SITE", paymentStatus: "REJECTED", rejectedReason: "Nao recebi" });
    expect(audit.after).toMatchObject({ paymentMethod: "PIX", paymentStatus: "PENDING", receiptUrl: RECEIPT });
    expect(events).toEqual(["payment-method-changed"]);
  });

  it("PIX com comprovante recusado passa para no local: o comprovante e o motivo saem", async () => {
    const { gameDay, registration } = await enrolled({ method: "PIX", status: "REJECTED", rejectedReason: "Valor errado" });
    expect((await changeMethod(gameDay.id, { paymentMethod: "ON_SITE" })).status).toBe(200);
    expect(await reload(registration.id)).toMatchObject({
      paymentMethod: "ON_SITE",
      paymentStatus: "PENDING",
      receiptUrl: null,
      rejectedReason: null,
    });
  });

  it("PIX sem comprovante (inscrito pelo organizador) passa para no local", async () => {
    const { gameDay, registration } = await enrolled({ method: "PIX", receiptUrl: null });
    expect((await changeMethod(gameDay.id, { paymentMethod: "ON_SITE" })).status).toBe(200);
    expect((await reload(registration.id)).paymentMethod).toBe("ON_SITE");
  });

  it("PIX com comprovante aguardando o organizador: 409 e nada muda", async () => {
    const { gameDay, registration } = await enrolled({ method: "PIX", status: "PENDING" });
    const res = await changeMethod(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Seu comprovante está em análise. Só dá para trocar se o organizador recusá-lo.");
    expect(await reload(registration.id)).toMatchObject({ paymentMethod: "PIX", paymentStatus: "PENDING" });
    expect(await prisma.auditLog.count({ where: { action: "REGISTRATION_PAYMENT_METHOD_CHANGED" } })).toBe(0);
  });

  it.each(["ON_SITE", "PIX"] as const)("pagamento %s ja confirmado: 409 e nada muda", async (method) => {
    const { gameDay, registration } = await enrolled({ method, status: "CONFIRMED" });
    const res = await changeMethod(gameDay.id, { paymentMethod: method === "PIX" ? "ON_SITE" : "PIX", receiptUrl: RECEIPT });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("O organizador já confirmou o seu pagamento.");
    expect(await reload(registration.id)).toMatchObject({ paymentMethod: method, paymentStatus: "CONFIRMED" });
  });

  it("para PIX sem comprovante: 400 e nada muda", async () => {
    const { gameDay, registration } = await enrolled({ method: "ON_SITE" });
    for (const body of [{ paymentMethod: "PIX" }, { paymentMethod: "PIX", receiptUrl: "" }]) {
      const res = await changeMethod(gameDay.id, body);
      expect(res.status).toBe(400);
      expect(res.json.error).toBe("Anexe o comprovante do PIX.");
    }
    expect((await reload(registration.id)).paymentMethod).toBe("ON_SITE");
  });

  it("escolher a forma que ja tem: 409", async () => {
    const { gameDay } = await enrolled({ method: "ON_SITE" });
    const res = await changeMethod(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Você já está com essa forma de pagamento.");
  });

  it("forma invalida: 422", async () => {
    const { gameDay } = await enrolled();
    const res = await changeMethod(gameDay.id, { paymentMethod: "CARTAO" });
    expect(res.status).toBe(422);
    expect(res.json.details.paymentMethod).toBe("Escolha a forma de pagamento.");
  });

  it("quem nao esta inscrito: 404", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    const res = await changeMethod(gameDay.id, { paymentMethod: "ON_SITE" });
    expect(res.status).toBe(404);
    expect(res.json.error).toBe("Você não está inscrito nesta pelada.");
  });

  it("nao mexe na inscricao de outra pessoa", async () => {
    const gameDay = await createGameDay();
    const [other] = await registerPlayers(gameDay.id, 1, { method: "ON_SITE" });
    await actAs(await createPlayer());
    expect((await changeMethod(gameDay.id, { paymentMethod: "PIX", receiptUrl: RECEIPT })).status).toBe(404);
    expect(await prisma.registration.findFirstOrThrow({ where: { userId: other.id } })).toMatchObject({ paymentMethod: "ON_SITE" });
  });

  it.each(["TEAMS_SET", "LIVE"] as const)("com a pelada %s ainda troca: pagamento nao depende dos times", async (status) => {
    const { gameDay, registration } = await enrolled({ method: "ON_SITE" }, { status });
    expect((await changeMethod(gameDay.id, { paymentMethod: "PIX", receiptUrl: RECEIPT })).status).toBe(200);
    expect((await reload(registration.id)).paymentMethod).toBe("PIX");
  });

  it("pelada encerrada ou cancelada: 409", async () => {
    for (const [status, error] of [
      ["FINISHED", "Esta pelada já foi encerrada."],
      ["CANCELED", "Esta pelada foi cancelada."],
    ] as const) {
      const { gameDay, registration } = await enrolled({ method: "ON_SITE" }, { status });
      const res = await changeMethod(gameDay.id, { paymentMethod: "PIX", receiptUrl: RECEIPT });
      expect(res.status).toBe(409);
      expect(res.json.error).toBe(error);
      expect((await reload(registration.id)).paymentMethod).toBe("ON_SITE");
    }
  });

  it("se o organizador decidir no meio do caminho, a decisao dele vence", async () => {
    const { gameDay, registration } = await enrolled({ method: "ON_SITE" });
    // A leitura da rota acontece antes: simula a confirmacao do organizador entre a leitura e a escrita.
    const findUnique = prisma.registration.findUnique.bind(prisma.registration);
    const spy = jest.spyOn(prisma.registration, "findUnique").mockImplementationOnce(((args: never) =>
      findUnique(args).then(async (row) => {
        await prisma.registration.update({ where: { id: registration.id }, data: { paymentStatus: "CONFIRMED" } });
        return row;
      })) as never);

    const res = await changeMethod(gameDay.id, { paymentMethod: "PIX", receiptUrl: RECEIPT });
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/organizador acabou de atualizar/);
    expect(await reload(registration.id)).toMatchObject({ paymentMethod: "ON_SITE", paymentStatus: "CONFIRMED", receiptUrl: null });
  });
});
