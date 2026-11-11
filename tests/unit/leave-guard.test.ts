import { isInAppLeave } from "../../src/lib/leave-guard";

const CURRENT = "https://voacraque.test/profile?aba=dados";

const base = {
  href: "/ranking",
  currentUrl: CURRENT,
  target: null,
  download: false,
  button: 0,
  modifier: false,
};

describe("isInAppLeave", () => {
  it("clique esquerdo num link interno sai da pagina", () => {
    expect(isInAppLeave(base)).toBe(true);
    expect(isInAppLeave({ ...base, href: "https://voacraque.test/game-days/1" })).toBe(true);
    expect(isInAppLeave({ ...base, href: "/profile?aba=outra" })).toBe(true);
    expect(isInAppLeave({ ...base, target: "_self" })).toBe(true);
  });

  it("botao que nao e o esquerdo nao segura", () => {
    expect(isInAppLeave({ ...base, button: 1 })).toBe(false);
    expect(isInAppLeave({ ...base, button: 2 })).toBe(false);
  });

  it("tecla modificadora abre em outra aba e nao segura", () => {
    expect(isInAppLeave({ ...base, modifier: true })).toBe(false);
  });

  it("target diferente de _self nao segura", () => {
    expect(isInAppLeave({ ...base, target: "_blank" })).toBe(false);
  });

  it("download nao segura", () => {
    expect(isInAppLeave({ ...base, download: true })).toBe(false);
  });

  it("href vazio ou ausente nao segura", () => {
    expect(isInAppLeave({ ...base, href: "" })).toBe(false);
    expect(isInAppLeave({ ...base, href: null })).toBe(false);
  });

  it("ancora na mesma pagina nao segura", () => {
    expect(isInAppLeave({ ...base, href: "#topo" })).toBe(false);
    expect(isInAppLeave({ ...base, href: "/profile?aba=dados#topo" })).toBe(false);
    expect(isInAppLeave({ ...base, href: "https://voacraque.test/profile?aba=dados" })).toBe(false);
  });

  it("mailto, tel e javascript nao seguram", () => {
    expect(isInAppLeave({ ...base, href: "mailto:a@b.com" })).toBe(false);
    expect(isInAppLeave({ ...base, href: "tel:+5583999999999" })).toBe(false);
    expect(isInAppLeave({ ...base, href: "javascript:void(0)" })).toBe(false);
  });

  it("outra origem nao segura", () => {
    expect(isInAppLeave({ ...base, href: "https://outro-site.com/pagina" })).toBe(false);
    expect(isInAppLeave({ ...base, href: "http://voacraque.test/ranking" })).toBe(false);
  });

  it("url atual invalida nao segura", () => {
    expect(isInAppLeave({ ...base, currentUrl: "nao e url" })).toBe(false);
  });
});
