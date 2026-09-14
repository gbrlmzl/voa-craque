import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BalanceError } from "@/lib/team-balancer";
import { MatchStateError } from "@/lib/match-engine";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (msg = "Faça login para continuar.") => new HttpError(401, msg);
export const forbidden = (msg = "Você não tem permissão para esta ação.") => new HttpError(403, msg);
export const notFound = (msg = "Registro não encontrado.") => new HttpError(404, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const conflict = (msg: string) => new HttpError(409, msg);

function fieldErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** Traduz qualquer erro do dominio para uma resposta JSON estavel. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: fieldErrors(error) },
      { status: 422 },
    );
  }
  if (error instanceof BalanceError || error instanceof MatchStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error("[voacraque] erro nao tratado", error);
  return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
}

/** Envolve o corpo de um route handler, padronizando o tratamento de erro. */
export async function route<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    if (data instanceof NextResponse) return data;
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
