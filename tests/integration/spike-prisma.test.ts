import { prisma } from "@/lib/prisma";

describe("spike D2: Prisma 7 sob Jest em CommonJS", () => {
  it("importa @/lib/prisma e consulta o banco de teste do worker", async () => {
    const rows = await prisma.$queryRaw<{ ok: number; db: string }[]>`SELECT 1 AS ok, current_database() AS db`;
    expect(rows[0].ok).toBe(1);
    expect(rows[0].db).toMatch(/_test_\d+$/);
  });
});
