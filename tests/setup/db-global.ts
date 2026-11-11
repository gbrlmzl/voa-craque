import { execFileSync } from "node:child_process";
import { Client } from "pg";

function withDatabase(url: string, name: string) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/**
 * Roda uma vez antes da suite de integracao: aplica as migrations no banco
 * template e cria um banco por worker do Jest a partir dele.
 */
export default async function globalSetup(globalConfig: { maxWorkers: number }) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente: o .env.test deveria te-la definido.");

  const template = new URL(url).pathname.slice(1);
  // Trava de seguranca: a suite apaga dados. Nunca roda em banco que nao seja de teste.
  if (!template.endsWith("_test")) {
    throw new Error(
      `Recusado: o banco "${template}" nao termina em "_test". Os testes de integracao so rodam em banco de teste.`,
    );
  }

  // Migrations no template. O DATABASE_URL ja esta no ambiente; o dotenv do
  // prisma.config.ts nao sobrescreve variavel definida.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });

  const workers = Math.max(1, globalConfig.maxWorkers);
  const admin = new Client({ connectionString: withDatabase(url, "postgres") });
  await admin.connect();
  try {
    for (let n = 1; n <= workers; n++) {
      const name = `${template}_${n}`;
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
    }
  } finally {
    await admin.end();
  }
}
