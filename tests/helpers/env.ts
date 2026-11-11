// Substitui vi.stubEnv / vi.unstubAllEnvs do Vitest: guarda o valor original de cada
// variavel na primeira vez que ela e trocada e devolve tudo em restoreEnv().
const original = new Map<string, string | undefined>();

export function stubEnv(name: string, value: string) {
  if (!original.has(name)) original.set(name, process.env[name]);
  (process.env as Record<string, string | undefined>)[name] = value;
}

export function restoreEnv() {
  for (const [name, value] of original) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[name];
    else (process.env as Record<string, string | undefined>)[name] = value;
  }
  original.clear();
}
