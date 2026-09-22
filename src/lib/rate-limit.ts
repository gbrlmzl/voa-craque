import { logSecurityEvent } from "@/lib/security-log";

/**
 * Limitador de janela fixa em memoria. A aplicacao roda em uma instancia so
 * (ver README); com mais de uma, cada instancia teria o proprio balde e o teto
 * efetivo multiplicaria. Nesse dia, troque o Map por um store compartilhado.
 */
type Bucket = { count: number; resetAt: number };

export type RateLimiter = {
  readonly name: string;
  /** Quanto falta para liberar, em segundos; 0 quando nao esta bloqueado. */
  retryAfter(key: string, now?: number): number;
  hit(key: string, now?: number): void;
  reset(key: string): void;
};

// O store fica no globalThis para sobreviver ao hot-reload e ser o mesmo entre
// os bundles de rota que importam este modulo.
const STORE_KEY = Symbol.for("voacraque.rate-limit");
const globalStore = globalThis as unknown as { [STORE_KEY]?: Map<string, Map<string, Bucket>> };
const stores = (globalStore[STORE_KEY] ??= new Map());

export function createRateLimiter({ name, max, windowMs }: { name: string; max: number; windowMs: number }): RateLimiter {
  const buckets = stores.get(name) ?? new Map<string, Bucket>();
  stores.set(name, buckets);

  const live = (key: string, now: number): Bucket | null => {
    const bucket = buckets.get(key);
    if (!bucket) return null;
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      return null;
    }
    return bucket;
  };

  return {
    name,
    retryAfter(key, now = Date.now()) {
      const bucket = live(key, now);
      if (!bucket || bucket.count < max) return 0;
      logSecurityEvent("rate_limit_exceeded", { limiter: name, key });
      return Math.ceil((bucket.resetAt - now) / 1000);
    },
    hit(key, now = Date.now()) {
      const bucket = live(key, now);
      if (bucket) {
        bucket.count += 1;
      } else {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
      }
      // Faxina barata para o Map nao crescer sem limite com IPs de passagem.
      if (buckets.size > 5000) {
        for (const [storedKey, stored] of buckets) if (stored.resetAt <= now) buckets.delete(storedKey);
      }
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}

/** Conta so as falhas: quem acerta a senha nunca gasta cota. */
export const loginLimiter = createRateLimiter({ name: "login", max: 8, windowMs: 15 * 60_000 });

/**
 * Conta toda tentativa, inclusive as que dao certo: o risco aqui nao e adivinhar
 * senha, e criar conta em massa (cada cadastro custa um bcrypt e uma linha).
 */
export const registerLimiter = createRateLimiter({ name: "register", max: 10, windowMs: 60 * 60_000 });

export function formatRetry(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}
