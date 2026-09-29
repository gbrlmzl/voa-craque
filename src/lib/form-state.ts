import type { ZodError } from "zod";

/**
 * Compartilhado entre `src/actions/auth.ts` e `src/actions/password.ts`. Nao
 * pode morar num arquivo com "use server": esses arquivos so podem exportar
 * funcoes assincronas (Server Actions), e esta e sincrona.
 */
export function fieldErrorsOf(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
