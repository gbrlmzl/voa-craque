import { describe, expect, it } from "vitest";
import { classifyPath, safeNextPath } from "@/lib/auth/routes";
import { applyUserPatch, mergeUserPatch } from "@/lib/auth/user-patch";
import type { CurrentUser } from "@/lib/auth/current-user";
import { clientIp } from "@/lib/client-ip";
import { createRateLimiter } from "@/lib/rate-limit";

describe("classifyPath", () => {
  it.each([
    ["/api/auth/callback/google", "auth-endpoint"],
    ["/api/auth", "auth-endpoint"],
    ["/login", "guest-only"],
    ["/registrar", "guest-only"],
    ["/manutencao", "public"],
    ["/api/peladas", "protected-api"],
    ["/api/authorize-algo", "protected-api"], // prefixo parecido nao e rota do Auth.js
    ["/", "protected-page"],
    ["/primeiro-acesso", "protected-page"],
    ["/login/extra", "protected-page"],
  ])("%s -> %s", (path, kind) => {
    expect(classifyPath(path)).toBe(kind);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/peladas/abc", "/peladas/abc"],
    ["/ranking?ordem=gols", "/ranking?ordem=gols"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    [null, "/"],
    ["", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("clientIp", () => {
  const headers = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

  it("com um proxy confiavel, usa o endereco que ele acrescentou (o ultimo)", () => {
    expect(clientIp(headers("6.6.6.6, 203.0.113.9"), 1)).toBe("203.0.113.9");
  });

  it("ignora o que o cliente forjou a esquerda da cadeia", () => {
    expect(clientIp(headers("1.1.1.1, 2.2.2.2, 203.0.113.9"), 1)).toBe("203.0.113.9");
  });

  it("com dois proxies confiaveis, pula o endereco do proxy interno", () => {
    expect(clientIp(headers("6.6.6.6, 203.0.113.9, 10.0.0.2"), 2)).toBe("203.0.113.9");
  });

  it("zero proxies se comporta como um: o Next preenche o header com o socket", () => {
    expect(clientIp(headers("203.0.113.9"), 0)).toBe("203.0.113.9");
  });

  it("mais hops que entradas cai na primeira, sem estourar", () => {
    expect(clientIp(headers("203.0.113.9"), 3)).toBe("203.0.113.9");
  });

  it("sem header nenhum", () => {
    expect(clientIp(headers(), 1)).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("bloqueia a partir do teto e libera quando a janela vira", () => {
    const limiter = createRateLimiter({ name: `teste-${Math.random()}`, max: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.retryAfter("ip", t0)).toBe(0);
      limiter.hit("ip", t0);
    }
    expect(limiter.retryAfter("ip", t0)).toBe(60);
    expect(limiter.retryAfter("ip", t0 + 30_000)).toBe(30);
    expect(limiter.retryAfter("ip", t0 + 60_000)).toBe(0);
  });

  it("cada chave tem o proprio balde", () => {
    const limiter = createRateLimiter({ name: `teste-${Math.random()}`, max: 1, windowMs: 60_000 });
    limiter.hit("a", 0);
    expect(limiter.retryAfter("a", 0)).toBeGreaterThan(0);
    expect(limiter.retryAfter("b", 0)).toBe(0);
  });

  it("dois limitadores com o mesmo nome compartilham o balde (ex.: bundles de rota diferentes)", () => {
    const name = `teste-${Math.random()}`;
    createRateLimiter({ name, max: 1, windowMs: 60_000 }).hit("ip", 0);
    expect(createRateLimiter({ name, max: 1, windowMs: 60_000 }).retryAfter("ip", 0)).toBeGreaterThan(0);
  });
});

describe("patch do usuario no contexto", () => {
  const server: CurrentUser = {
    id: "u1",
    email: "a@b.c",
    name: "Gabriel",
    role: "USER",
    profileCompleted: true,
    photoUrl: null,
    hasPassword: true,
    googleLinked: false,
  };

  it("sem patch, vale o servidor", () => {
    expect(applyUserPatch(server, null)).toBe(server);
  });

  it("o patch mescla sobre o servidor sem apagar o resto", () => {
    expect(applyUserPatch(server, { photoUrl: "/foto.png" })).toEqual({ ...server, photoUrl: "/foto.png" });
  });

  it("edicoes seguidas se acumulam", () => {
    const patch = mergeUserPatch(mergeUserPatch(null, { photoUrl: "/1.png" }), { name: "Gabi" });
    expect(applyUserPatch(server, patch)).toMatchObject({ photoUrl: "/1.png", name: "Gabi", hasPassword: true });
  });

  it("sem sessao, o patch nao cria um usuario do nada", () => {
    expect(applyUserPatch(null, { name: "Fantasma" })).toBeNull();
  });
});
