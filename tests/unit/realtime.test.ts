import { publishGameDay, subscribeGameDay, withLock } from "../../src/lib/realtime";

describe("publishGameDay / subscribeGameDay", () => {
  it("entrega o aviso so a quem assinou aquela pelada", () => {
    const a: string[] = [];
    const b: string[] = [];
    const stopA = subscribeGameDay("g1", (n) => a.push(n.reason));
    const stopB = subscribeGameDay("g2", (n) => b.push(n.reason));
    publishGameDay("g1", "gol");
    publishGameDay("g2", "fim");
    expect(a).toEqual(["gol"]);
    expect(b).toEqual(["fim"]);
    stopA();
    stopB();
  });

  it("cancelar a assinatura para de receber; o aviso carrega o horario", () => {
    const seen: { reason: string; at: number }[] = [];
    const stop = subscribeGameDay("g3", (n) => seen.push(n));
    publishGameDay("g3", "um");
    stop();
    publishGameDay("g3", "dois");
    expect(seen).toHaveLength(1);
    expect(seen[0].reason).toBe("um");
    expect(seen[0].at).toBeGreaterThan(0);
  });

  it("muitas abas assinando a mesma pelada nao estouram o limite de listeners", () => {
    const warn = jest.spyOn(process, "emitWarning").mockImplementation(() => {});
    const stops = Array.from({ length: 30 }, () => subscribeGameDay("g4", () => {}));
    expect(warn).not.toHaveBeenCalled();
    stops.forEach((stop) => stop());
    warn.mockRestore();
  });
});

describe("withLock", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("serializa chamadas concorrentes na mesma chave", async () => {
    const order: string[] = [];
    await Promise.all([
      withLock("k", async () => { order.push("a-inicio"); await sleep(30); order.push("a-fim"); }),
      withLock("k", async () => { order.push("b-inicio"); await sleep(5); order.push("b-fim"); }),
    ]);
    expect(order).toEqual(["a-inicio", "a-fim", "b-inicio", "b-fim"]);
  });

  it("nao bloqueia chaves diferentes", async () => {
    const order: string[] = [];
    await Promise.all([
      withLock("x", async () => { order.push("x-inicio"); await sleep(30); order.push("x-fim"); }),
      withLock("y", async () => { order.push("y-inicio"); await sleep(5); order.push("y-fim"); }),
    ]);
    expect(order).toEqual(["x-inicio", "y-inicio", "y-fim", "x-fim"]);
  });

  it("devolve o resultado, propaga o erro e nao trava a fila", async () => {
    expect(await withLock("r", async () => 42)).toBe(42);
    await expect(withLock("e", async () => { throw new Error("falhou"); })).rejects.toThrow("falhou");
    expect(await withLock("e", async () => "depois")).toBe("depois");
  });
});
