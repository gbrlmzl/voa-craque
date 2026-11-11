import { ZodError, z } from "zod";
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  notFound,
  route,
  toErrorResponse,
  unauthorized,
} from "../../src/lib/http";
import { BalanceError } from "../../src/lib/team-balancer";
import { MatchStateError } from "../../src/lib/match-engine";
import { SubstitutionError } from "../../src/lib/substitution";
import { NextResponse } from "next/server";

const bodyOf = async (response: Response) => ({ status: response.status, json: await response.json() });

describe("fabricas de HttpError", () => {
  it("status e mensagem padrao", () => {
    expect(unauthorized()).toMatchObject({ status: 401, message: "Faça login para continuar." });
    expect(forbidden()).toMatchObject({ status: 403, message: "Você não tem permissão para esta ação." });
    expect(notFound()).toMatchObject({ status: 404, message: "Registro não encontrado." });
    expect(badRequest("x", { a: 1 })).toMatchObject({ status: 400, message: "x", details: { a: 1 } });
    expect(conflict("y")).toMatchObject({ status: 409, message: "y" });
    expect(unauthorized("outra")).toHaveProperty("message", "outra");
  });
});

describe("toErrorResponse", () => {
  it("HttpError mantem status, mensagem e details", async () => {
    expect(await bodyOf(toErrorResponse(new HttpError(418, "cha", { x: 1 })))).toEqual({
      status: 418,
      json: { error: "cha", details: { x: 1 } },
    });
  });

  it("ZodError: 422 com um erro por campo (o primeiro) e _ para erro na raiz", async () => {
    const schema = z
      .object({ nome: z.string().min(3, "curto").max(2, "longo"), idade: z.number({ message: "numero" }) })
      .refine(() => false, "raiz");
    const result = schema.safeParse({ nome: "a", idade: "x" });
    const error = result.error as ZodError;
    const { status, json } = await bodyOf(toErrorResponse(error));
    expect(status).toBe(422);
    expect(json.error).toBe("Dados inválidos.");
    expect(json.details).toEqual({ nome: "curto", idade: "numero" });
  });

  it.each([
    ["BalanceError", new BalanceError("poucos jogadores")],
    ["MatchStateError", new MatchStateError("partida parada")],
    ["SubstitutionError", new SubstitutionError("troca invalida")],
  ])("%s vira 409 com a mensagem", async (_name, error) => {
    expect(await bodyOf(toErrorResponse(error))).toEqual({ status: 409, json: { error: error.message } });
  });

  it("erro desconhecido: 500 sem vazar a mensagem, e vai para o log", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { status, json } = await bodyOf(toErrorResponse(new Error("senha do banco: 123")));
    expect(status).toBe(500);
    expect(json).toEqual({ error: "Erro interno do servidor." });
    expect(JSON.stringify(json)).not.toContain("senha do banco");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("route()", () => {
  it("devolve o objeto como JSON; undefined vira { ok: true }", async () => {
    expect(await bodyOf(await route(async () => ({ a: 1 })))).toEqual({ status: 200, json: { a: 1 } });
    expect(await bodyOf(await route(async () => undefined))).toEqual({ status: 200, json: { ok: true } });
  });
  it("respeita um NextResponse pronto", async () => {
    const response = await route(async () => NextResponse.json({ criado: true }, { status: 201 }));
    expect(await bodyOf(response)).toEqual({ status: 201, json: { criado: true } });
  });
  it("traduz o que for lancado", async () => {
    expect((await route(async () => { throw notFound("sumiu"); })).status).toBe(404);
  });
});
