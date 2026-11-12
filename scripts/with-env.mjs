// Roda um comando com as variaveis de um arquivo .env, sem sobrescrever o que ja esta no ambiente
// (o CI define DATABASE_URL e AUTH_SECRET proprios). Existe porque `node --env-file=...` nao serve
// para o Next: os workers do `next build` herdam a flag e recusam subir.
// Uso: node scripts/with-env.mjs .env.e2e -- next build
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const [file, separator, command, ...args] = process.argv.slice(2);
if (!file || separator !== "--" || !command) {
  console.error("Uso: node scripts/with-env.mjs <arquivo.env> -- <comando> [args...]");
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`Arquivo de ambiente nao encontrado: ${file}`);
  process.exit(2);
}

const env = { ...process.env };
for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const index = line.indexOf("=");
  if (index < 1) continue;
  const key = line.slice(0, index).trim();
  let value = line.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (env[key] === undefined) env[key] = value;
}

const child = spawn(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
