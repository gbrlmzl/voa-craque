import { EventEmitter } from "node:events";

export type LiveNotice = { reason: string; at: number };

type Bus = EventEmitter & { __voacraque?: true };

const globalForBus = globalThis as unknown as { __voacraqueBus?: Bus };

function getBus(): Bus {
  if (!globalForBus.__voacraqueBus) {
    const bus = new EventEmitter() as Bus;
    // Cada aba aberta no painel ou na tela de espectador vira um listener.
    bus.setMaxListeners(0);
    globalForBus.__voacraqueBus = bus;
  }
  return globalForBus.__voacraqueBus;
}

const topic = (gameDayId: string) => `gameday:${gameDayId}`;

/** Avisa todas as conexoes SSE abertas que o estado da pelada mudou. */
export function publishGameDay(gameDayId: string, reason: string): void {
  getBus().emit(topic(gameDayId), { reason, at: Date.now() } satisfies LiveNotice);
}

export function subscribeGameDay(gameDayId: string, listener: (notice: LiveNotice) => void): () => void {
  const bus = getBus();
  const channel = topic(gameDayId);
  bus.on(channel, listener);
  return () => {
    bus.off(channel, listener);
  };
}

/**
 * Serializa operacoes concorrentes sobre a mesma pelada. Varias conexoes SSE
 * checam o fim do cronometro ao mesmo tempo; sem isso, duas delas encerrariam
 * a mesma partida.
 */
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}
