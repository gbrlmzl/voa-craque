import { describe, expect, it } from "vitest";
import type { RefreshTokenRevokeReason } from "@/generated/prisma/client";
import { REFRESH_GRACE_S } from "@/lib/auth/config";
import {
  classifyRefreshToken,
  hashRefreshToken,
  newRawRefreshToken,
  purgeCutoff,
  refreshExpiresAt,
  type RefreshTokenRow,
} from "@/lib/auth/refresh-token-state";

const NOW = new Date("2026-09-30T12:00:00Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe("newRawRefreshToken", () => {
  it("80 caracteres hex, e duas chamadas diferem", () => {
    const first = newRawRefreshToken();
    expect(first).toMatch(/^[0-9a-f]{80}$/);
    expect(newRawRefreshToken()).not.toBe(first);
  });
});

describe("hashRefreshToken", () => {
  it("e deterministico, hex de 64 e diferente do valor puro", () => {
    const raw = newRawRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
    expect(hashRefreshToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(raw)).not.toBe(raw);
  });

  it("valores diferentes geram hashes diferentes", () => {
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });
});

describe("prazos", () => {
  it("refresh vale 7 dias a partir de agora", () => {
    expect(refreshExpiresAt(NOW).getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
  });

  it("a purga corta 30 dias para tras", () => {
    expect(purgeCutoff(NOW).getTime()).toBe(NOW.getTime() - 30 * 86_400_000);
  });
});

describe("classifyRefreshToken", () => {
  const live = (): RefreshTokenRow => ({ revokedAt: null, revokedReason: null, expiresAt: inDays(7) });
  const rotated = (ago: number, expiresAt = inDays(7)): RefreshTokenRow => ({
    revokedAt: secondsAgo(ago),
    revokedReason: "ROTATED",
    expiresAt,
  });

  it("linha inexistente e unknown", () => {
    expect(classifyRefreshToken(null, false, NOW)).toBe("unknown");
  });

  it("vivo e dentro do prazo e active", () => {
    expect(classifyRefreshToken(live(), false, NOW)).toBe("active");
  });

  it("vivo com expiresAt igual a agora ja e expired", () => {
    expect(classifyRefreshToken({ ...live(), expiresAt: NOW }, false, NOW)).toBe("expired");
  });

  it("rotacionado ha 5 s com sucessor vivo e grace (requisicao concorrente)", () => {
    expect(classifyRefreshToken(rotated(5), true, NOW)).toBe("grace");
  });

  it("o limite exato da graca ainda e grace", () => {
    expect(classifyRefreshToken(rotated(REFRESH_GRACE_S), true, NOW)).toBe("grace");
  });

  it("rotacionado ha 11 s, mesmo com sucessor vivo, e reused (roubo)", () => {
    expect(classifyRefreshToken(rotated(REFRESH_GRACE_S + 1), true, NOW)).toBe("reused");
  });

  it("rotacionado ha 5 s SEM sucessor vivo e reused", () => {
    expect(classifyRefreshToken(rotated(5), false, NOW)).toBe("reused");
  });

  it("rotacionado dentro da graca, mas ja expirado, e expired", () => {
    expect(classifyRefreshToken(rotated(5, secondsAgo(1)), true, NOW)).toBe("expired");
  });

  it.each<RefreshTokenRevokeReason>(["LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET", "GOOGLE_LINKED", "REUSE_DETECTED"])(
    "revogado por %s e revoked, nunca grace nem reused (mesmo ha 1 s e com sucessor vivo)",
    (reason) => {
      const row: RefreshTokenRow = { revokedAt: secondsAgo(1), revokedReason: reason, expiresAt: inDays(7) };
      expect(classifyRefreshToken(row, true, NOW)).toBe("revoked");
      expect(classifyRefreshToken(row, false, NOW)).toBe("revoked");
    },
  );
});
