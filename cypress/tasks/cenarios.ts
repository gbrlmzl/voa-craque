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
  | "destaques"
  | "destaques-empate"
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

/** O que o cenario "destaques" garante por jogador, contado pelo proprio script (nao pelo service de estatisticas). */
export type EsperadoJogador = {
  username: string;
  nome: string;
  jogos: number;
  vitorias: number;
  derrotas: number;
  gols: number;
  assistencias: number;
};

export type DadosDestaques = {
  /** Todos os 12 que jogaram, por username. */
  jogadores: Record<string, EsperadoJogador>;
  /** Quem fez o maior numero de gols da pelada (varios, no empate). */
  artilheiros: string[];
  /** Maior numero de gols. */
  maximoDeGols: number;
};

type Lance = { lado: "home" | "away"; autor: number; assistente: number | null };

/**
 * Pelada encerrada com placar roteirizado: tres partidas, o vencedor fica, 12 jogadores em 3 times.
 *   1) mandante 2 x 0  (autor 0 faz os dois)
 *   2) mandante 2 x 1  (o visitante abre o placar; o mandante vira com o autor 0 e o autor 2)
 *   3) visitante 2 x 0 (o autor 0 do visitante faz os dois)
 * Sem empate: o autor 0 do time que ganhou as duas primeiras fecha com 3 gols e e o unico artilheiro.
 * Com `empate`, o segundo gol do mandante da partida 2 passa para o autor 2: tres jogadores com 2 gols.
 */
async function destaques({ empate = false } = {}): Promise<DadosDestaques> {
  const ctx = await aoVivo();
  const actor = toCurrentUser(ctx.organizador);
  const gameDayId = ctx.gameDay.id;

  const rodadas: { vence: "home" | "away"; lances: Lance[] }[] = [
    {
      vence: "home",
      lances: [
        { lado: "home", autor: 0, assistente: 1 },
        { lado: "home", autor: 0, assistente: 1 },
      ],
    },
    {
      vence: "home",
      lances: [
        { lado: "away", autor: 0, assistente: null },
        { lado: "home", autor: empate ? 2 : 0, assistente: 1 },
        { lado: "home", autor: 2, assistente: 3 },
      ],
    },
    {
      vence: "away",
      lances: [
        { lado: "away", autor: 0, assistente: 1 },
        { lado: "away", autor: 0, assistente: 1 },
      ],
    },
  ];

  const conta = new Map<string, Omit<EsperadoJogador, "username" | "nome">>();
  const linha = (userId: string) => {
    if (!conta.has(userId)) conta.set(userId, { jogos: 0, vitorias: 0, derrotas: 0, gols: 0, assistencias: 0 });
    return conta.get(userId)!;
  };
  // Ordem fixa por userId: o indice "autor 0" e o mesmo jogador em todas as rodadas do time.
  const elenco = (team: { players: { userId: string }[] }) => team.players.map((p) => p.userId).sort();

  for (const rodada of rodadas) {
    const partida = await prisma.match.findFirstOrThrow({
      where: { gameDayId, status: { not: "FINISHED" } },
      orderBy: { orderIndex: "asc" },
      include: { homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } },
    });
    const times = { home: partida.homeTeam, away: partida.awayTeam };
    await changeMatchState(partida.id, "START", actor);

    for (const lance of rodada.lances) {
      const time = times[lance.lado];
      const jogadores = elenco(time);
      const autor = jogadores[lance.autor];
      const assistente = lance.assistente === null ? null : jogadores[lance.assistente];
      await recordMatchEvent(
        partida.id,
        { type: "GOAL", teamId: time.id, userId: autor, assistUserId: assistente },
        actor,
      );
      linha(autor).gols += 1;
      if (assistente) linha(assistente).assistencias += 1;
    }

    for (const lado of ["home", "away"] as const) {
      for (const userId of elenco(times[lado])) {
        const registro = linha(userId);
        registro.jogos += 1;
        if (lado === rodada.vence) registro.vitorias += 1;
        else registro.derrotas += 1;
      }
    }
  }
  await finishGameDayService(gameDayId, actor);

  const usuarios = await prisma.user.findMany({
    where: { id: { in: [...conta.keys()] } },
    select: { id: true, username: true, profile: { select: { name: true } } },
  });
  const jogadores: Record<string, EsperadoJogador> = {};
  for (const usuario of usuarios) {
    jogadores[usuario.username] = {
      username: usuario.username,
      nome: usuario.profile?.name ?? usuario.username,
      ...conta.get(usuario.id)!,
    };
  }
  const maximoDeGols = Math.max(...Object.values(jogadores).map((j) => j.gols));
  const artilheiros = Object.values(jogadores)
    .filter((j) => j.gols === maximoDeGols)
    .map((j) => j.username)
    .sort();
  return { jogadores, artilheiros, maximoDeGols };
}

export async function aplicarCenario(nome: Cenario) {
  await limparBanco();
  let dados: DadosDestaques | null = null;
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
    case "destaques":
      dados = await destaques();
      break;
    case "destaques-empate":
      dados = await destaques({ empate: true });
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
  return { cenario: nome, gameDayId: gameDay?.id ?? null, dados };
}
