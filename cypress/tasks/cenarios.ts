// Cenarios semeados do E2E. Reaproveita as fabricas de tests/helpers/factories.ts: o mesmo
// codigo que monta o estado dos testes de integracao monta o do navegador.
import { prisma } from "@/lib/prisma";
import { finishGameDay as finishGameDayService, startGameDay } from "@/services/gameday";
import { changeMatchState, recordMatchEvent } from "@/services/match";
import { drawTeams } from "@/services/teams";
import {
  createAdmin,
  createGameDay,
  createPlayer,
  createSuperadmin,
  createUser,
  ensureSettings,
  registerUser,
  toCurrentUser,
} from "../../tests/helpers/factories";

export const SENHA = "Senha@123";

export type Cenario =
  | "base"
  | "pelada-aberta"
  | "pelada-lotada"
  | "times-definidos"
  | "ao-vivo"
  | "encerrada"
  | "site-privado"
  | "manutencao";

export async function limparBanco() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

const amanha = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(20, 0, 0, 0);
  return date;
};

async function base() {
  await ensureSettings({ publicAccessEnabled: true, privateSiteEnabled: false, registrationOpen: true });
  const superadmin = await createSuperadmin({ username: "super", profile: { name: "Super Admin" } });
  const organizador = await createAdmin({ username: "organizador", profile: { name: "Organizador Teste" } });
  const posicoes = ["GOALKEEPER", "FIXO", "ALA", "PIVO"] as const;
  const jogadores = [];
  for (let i = 1; i <= 14; i++) {
    jogadores.push(
      await createPlayer({
        username: `jogador${String(i).padStart(2, "0")}`,
        profile: { name: `Jogador ${String(i).padStart(2, "0")}`, stars: 1 + (i % 5), position: posicoes[i % 4], age: 20 + i },
      }),
    );
  }
  await createUser({ username: "novato", email: "novato@teste.voacraque.app", profile: false });
  return { superadmin, organizador, jogadores };
}

async function peladaAberta({ lotada = false } = {}) {
  const ctx = await base();
  const gameDay = await createGameDay({
    title: "Pelada de teste",
    scheduledAt: amanha(),
    maxPlayers: 10,
    teamSize: 4,
    createdById: ctx.organizador.id,
  });
  const quantos = lotada ? 10 : 6;
  for (const [index, jogador] of ctx.jogadores.slice(0, quantos).entries()) {
    const pix = index < 2;
    await registerUser(gameDay.id, jogador.id, { method: pix ? "PIX" : "ON_SITE", status: "PENDING" });
  }
  return { ...ctx, gameDay };
}

async function timesDefinidos() {
  const ctx = await base();
  const gameDay = await createGameDay({
    title: "Pelada de teste",
    scheduledAt: amanha(),
    maxPlayers: 20,
    teamSize: 4,
    createdById: ctx.organizador.id,
  });
  for (const jogador of ctx.jogadores.slice(0, 12)) await registerUser(gameDay.id, jogador.id, { status: "CONFIRMED" });
  await drawTeams(gameDay.id, toCurrentUser(ctx.organizador), 11);
  return { ...ctx, gameDay };
}

async function aoVivo() {
  const ctx = await timesDefinidos();
  await startGameDay(ctx.gameDay.id, toCurrentUser(ctx.organizador));
  return ctx;
}

async function encerrada() {
  const ctx = await aoVivo();
  const actor = toCurrentUser(ctx.organizador);
  for (let rodada = 0; rodada < 4; rodada++) {
    const partida = await prisma.match.findFirstOrThrow({
      where: { gameDayId: ctx.gameDay.id, status: { not: "FINISHED" } },
      orderBy: { orderIndex: "asc" },
      include: { homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } },
    });
    await changeMatchState(partida.id, "START", actor);
    const time = rodada % 2 === 0 ? partida.homeTeam : partida.awayTeam;
    for (let gol = 0; gol < 2; gol++) {
      await recordMatchEvent(
        partida.id,
        {
          type: "GOAL",
          teamId: time.id,
          userId: time.players[gol].userId,
          assistUserId: time.players[(gol + 1) % time.players.length].userId,
        },
        actor,
      );
    }
  }
  await finishGameDayService(ctx.gameDay.id, actor);
  return ctx;
}

export async function aplicarCenario(nome: Cenario) {
  await limparBanco();
  switch (nome) {
    case "base":
      await base();
      break;
    case "pelada-aberta":
      await peladaAberta();
      break;
    case "pelada-lotada":
      await peladaAberta({ lotada: true });
      break;
    case "times-definidos":
      await timesDefinidos();
      break;
    case "ao-vivo":
      await aoVivo();
      break;
    case "encerrada":
      await encerrada();
      break;
    case "site-privado":
      await base();
      await ensureSettings({ privateSiteEnabled: true });
      break;
    case "manutencao":
      await base();
      await ensureSettings({ publicAccessEnabled: false });
      break;
    default:
      throw new Error(`Cenario desconhecido: ${nome}`);
  }
  const gameDay = await prisma.gameDay.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  return { cenario: nome, gameDayId: gameDay?.id ?? null };
}
