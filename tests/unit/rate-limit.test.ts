import { createRateLimiter, formatRetry } from "../../src/lib/rate-limit";

const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
afterAll(() => warn.mockRestore());

let counter = 0;
const limiter = (max = 3, windowMs = 60_000) => createRateLimiter({ name: `teste-${++counter}`, max, windowMs });

describe("createRateLimiter", () => {
  it("libera ate o teto e bloqueia a partir dele, com retryAfter em segundos", () => {
    const l = limiter(3, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(l.retryAfter("ip", t0)).toBe(0);
      l.hit("ip", t0);
    }
    expect(l.retryAfter("ip", t0)).toBe(60);
    expect(l.retryAfter("ip", t0 + 30_500)).toBe(30);
  });

  it("a janela e fixa: depois dela o contador zera", () => {
    const l = limiter(1, 1000);
    l.hit("ip", 0);
    expect(l.retryAfter("ip", 999)).toBe(1);
    expect(l.retryAfter("ip", 1000)).toBe(0);
    l.hit("ip", 1000);
    expect(l.retryAfter("ip", 1500)).toBe(1);
  });

  it("chaves independentes", () => {
    const l = limiter(1);
    l.hit("a", 0);
    expect(l.retryAfter("a", 0)).toBeGreaterThan(0);
    expect(l.retryAfter("b", 0)).toBe(0);
  });

  it("reset libera so a chave pedida", () => {
    const l = limiter(1);
    l.hit("a", 0);
    l.hit("b", 0);
    l.reset("a");
    expect(l.retryAfter("a", 0)).toBe(0);
    expect(l.retryAfter("b", 0)).toBeGreaterThan(0);
  });

  it("bloqueio vai para o log de seguranca com o nome do limitador", () => {
    const l = limiter(1);
    l.hit("ip", 0);
    l.retryAfter("ip", 0);
    const last = JSON.parse(String(warn.mock.calls.at(-1)![0]));
    expect(last).toMatchObject({ type: "security", event: "rate_limit_exceeded", limiter: l.name, key: "ip" });
  });

  it("dois limitadores com o mesmo nome compartilham o balde (sobrevive ao hot-reload)", () => {
    const a = createRateLimiter({ name: "compartilhado", max: 1, windowMs: 1000 });
    const b = createRateLimiter({ name: "compartilhado", max: 1, windowMs: 1000 });
    a.hit("x", 0);
    expect(b.retryAfter("x", 0)).toBeGreaterThan(0);
  });

  it("faxina os baldes vencidos quando o mapa cresce demais", () => {
    const l = limiter(5, 1000);
    for (let i = 0; i < 5001; i++) l.hit(`ip-${i}`, 0);
    l.hit("novo", 5000); // tudo acima expirou e e removido
    expect(l.retryAfter("ip-1", 5000)).toBe(0);
  });
});

describe("formatRetry", () => {
  it.each([
    [1, "1 minuto"],
    [60, "1 minuto"],
    [61, "2 minutos"],
    [900, "15 minutos"],
    [0, "1 minuto"],
  ])("%i s -> %s", (seconds, text) => expect(formatRetry(seconds)).toBe(text));
});
