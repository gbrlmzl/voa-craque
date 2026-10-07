import { describe, expect, it } from "vitest";
import { ByteLru } from "@/lib/photo-cache";

const bytes = (size: number, fill = 1) => Buffer.alloc(size, fill);

describe("ByteLru", () => {
  it("guarda e devolve o item", () => {
    const cache = new ByteLru({ maxBytes: 100, maxItemBytes: 50 });
    const item = bytes(10);

    cache.set("a", item);

    expect(cache.get("a")).toBe(item);
    expect(cache.get("inexistente")).toBeUndefined();
  });

  it("remove o item usado ha mais tempo quando passa de maxBytes", () => {
    const cache = new ByteLru({ maxBytes: 30, maxItemBytes: 30 });

    cache.set("a", bytes(10));
    cache.set("b", bytes(10));
    cache.set("c", bytes(10));
    cache.set("d", bytes(10));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.get("d")).toBeDefined();
    expect(cache.totalBytes).toBe(30);
  });

  it("get renova a posicao do item", () => {
    const cache = new ByteLru({ maxBytes: 30, maxItemBytes: 30 });

    cache.set("a", bytes(10));
    cache.set("b", bytes(10));
    cache.set("c", bytes(10));
    cache.get("a"); // a vira o mais recente; b passa a ser o mais antigo
    cache.set("d", bytes(10));

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
  });

  it("remove varios itens se o novo for grande", () => {
    const cache = new ByteLru({ maxBytes: 30, maxItemBytes: 30 });

    cache.set("a", bytes(10));
    cache.set("b", bytes(10));
    cache.set("c", bytes(10));
    cache.set("grande", bytes(25));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
    expect(cache.get("grande")).toBeDefined();
    expect(cache.totalBytes).toBe(25);
  });

  it("nao guarda item acima de maxItemBytes e nao expulsa os outros por causa dele", () => {
    const cache = new ByteLru({ maxBytes: 100, maxItemBytes: 20 });

    cache.set("a", bytes(10));
    cache.set("enorme", bytes(21));

    expect(cache.get("enorme")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.size).toBe(1);
  });

  it("regravar a mesma chave nao conta os bytes duas vezes", () => {
    const cache = new ByteLru({ maxBytes: 100, maxItemBytes: 50 });

    cache.set("a", bytes(10));
    cache.set("a", bytes(15));

    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(15);
  });
});
