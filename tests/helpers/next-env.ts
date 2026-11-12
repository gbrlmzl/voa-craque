// Estado compartilhado dos mocks de next/headers e next/server (ver tests/setup/next-mocks.ts).
// Fora de uma requisicao real, cookies() e headers() lancam; aqui eles leem e gravam
// neste estado, que cada teste reinicia.
export type CookieOptions = Record<string, unknown>;
export type CookieWriteRecord = { name: string; value: string; options?: CookieOptions };

const jar = new Map<string, string>();
const writes: CookieWriteRecord[] = [];
let requestHeaders = new Headers();
let afterQueue: Array<() => unknown> = [];
let ipCounter = 0;

export const mailbox: Array<{ to: string; subject: string; text: string; html: string }> = [];

export function resetNextEnv() {
  jar.clear();
  writes.length = 0;
  afterQueue = [];
  mailbox.length = 0;
  ipCounter += 1;
  // IP unico por teste: os limitadores de taxa vivem em memoria no processo.
  requestHeaders = new Headers({ "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.1` });
}

export function setCookie(name: string, value: string) {
  jar.set(name, value);
}
export function clearCookies() {
  jar.clear();
}
export function cookieJar(): Record<string, string> {
  return Object.fromEntries(jar);
}
export function cookieWrites(): CookieWriteRecord[] {
  return [...writes];
}
export function setRequestHeader(name: string, value: string) {
  requestHeaders.set(name, value);
}
export function currentRequestIp(): string {
  return requestHeaders.get("x-forwarded-for") ?? "unknown";
}

/** O que `cookies()` de next/headers devolve. */
export function fakeCookieStore() {
  return {
    get(name: string) {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return [...jar].map(([name, value]) => ({ name, value }));
    },
    has: (name: string) => jar.has(name),
    set(name: string, value: string, options?: CookieOptions) {
      writes.push({ name, value, options });
      if (options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
    delete(name: string) {
      writes.push({ name, value: "", options: { maxAge: 0 } });
      jar.delete(name);
    },
  };
}

export function fakeHeaders(): Headers {
  return requestHeaders;
}

export function queueAfter(task: () => unknown) {
  afterQueue.push(task);
}

/** Executa o que as Server Actions agendaram com `after()` e espera terminar. */
export async function flushAfter() {
  const tasks = afterQueue;
  afterQueue = [];
  for (const task of tasks) await task();
}
