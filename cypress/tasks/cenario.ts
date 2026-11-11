import { prisma } from "@/lib/prisma";
import { aplicarCenario, type Cenario } from "./cenarios";
import { assertE2eDatabase, reply } from "./guard";

assertE2eDatabase();
aplicarCenario(process.argv[2] as Cenario)
  .then(reply)
  .finally(() => prisma.$disconnect());
