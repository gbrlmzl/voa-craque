// So leitura: asserções pontuais ("a inscricao ficou PAID"). Recusa qualquer coisa que nao seja SELECT.
import { prisma } from "@/lib/prisma";
import { assertE2eDatabase, reply } from "./guard";

assertE2eDatabase();
const query = process.argv[2] ?? "";

async function main() {
  if (!/^\s*select\b/i.test(query) || /;\s*\S/.test(query)) {
    throw new Error("A task sql so aceita um unico SELECT.");
  }
  const rows = await prisma.$queryRawUnsafe<unknown[]>(query);
  reply(JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v))));
}

main().finally(() => prisma.$disconnect());
