import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, profileChanged } from "../src/lib/profile-defaults";

const BASE = { ...EMPTY_PROFILE, name: "Fernando", nickname: "Fernandinho", age: "21", photoUrl: "/praia.webp" };

describe("profileChanged", () => {
  it("iguais nao mudaram", () => {
    expect(profileChanged(BASE, { ...BASE })).toBe(false);
  });

  it("detecta mudanca em cada campo editavel", () => {
    for (const field of ["name", "nickname", "foot", "position", "age", "heightCm", "weightKg", "photoUrl"] as const) {
      expect(profileChanged(BASE, { ...BASE, [field]: `${BASE[field]}x` })).toBe(true);
    }
  });

  it("ignora as estrelas, que o jogador nao edita", () => {
    expect(profileChanged({ ...BASE, stars: 3 }, { ...BASE, stars: 4.5 })).toBe(false);
  });
});
