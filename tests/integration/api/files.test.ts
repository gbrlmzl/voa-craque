import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GET } from "@/app/api/files/[...path]/route";
import { callRoute } from "../../helpers/route";
import { createAdmin, createGameDay, createPlayer, ensureSettings, registerUser } from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

const get = (...segments: string[]) =>
  callRoute(GET, { path: `/api/files/${segments.join("/")}`, params: { path: segments } });

async function put(key: string, content: string | Buffer) {
  const target = path.join(process.env.UPLOAD_DIR!, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

describe("GET /api/files/[...path]", () => {
  it("foto: serve o arquivo com Content-Type e cache imutavel privado", async () => {
    await put("fotos/a1.webp", "bytes-da-foto");
    await actAs(await createPlayer());
    const res = await get("fotos", "a1.webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  });

  it("foto: visitante ve com o site aberto; site privado: 401; manutencao: 403", async () => {
    await put("fotos/a2.webp", "x");
    asVisitor();
    expect((await get("fotos", "a2.webp")).status).toBe(200);
    await ensureSettings({ privateSiteEnabled: true });
    expect((await get("fotos", "a2.webp")).status).toBe(401);
    await ensureSettings({ publicAccessEnabled: false });
    expect((await get("fotos", "a2.webp")).status).toBe(403);
  });

  it("foto inexistente: 404, e nunca recebe o cache imutavel", async () => {
    asVisitor();
    const res = await get("fotos", "nao-existe.webp");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control") ?? "").not.toMatch(/immutable/);
  });

  it("caminho com .. nao sai da pasta de uploads: 404", async () => {
    await put("segredo.txt", "nao pode vazar");
    asVisitor();
    expect((await get("fotos", "..", "..", "segredo.txt")).status).toBe(404);
    await actAs(await createAdmin());
    expect((await get("comprovantes", "..", "segredo.txt")).status).toBe(404);
  });

  it("outros arquivos exigem login", async () => {
    await put("comprovantes/c0.png", "x");
    asVisitor();
    expect((await get("comprovantes", "c0.png")).status).toBe(401);
  });

  it("comprovante: so o dono da inscricao e os organizadores", async () => {
    await put("comprovantes/c1.png", "comprovante");
    const gameDay = await createGameDay();
    const owner = await createPlayer();
    const other = await createPlayer();
    const registration = await registerUser(gameDay.id, owner.id, { method: "PIX" });
    const { prisma } = await import("@/lib/prisma");
    await prisma.registration.update({ where: { id: registration.id }, data: { receiptUrl: "/api/files/comprovantes/c1.png" } });

    await actAs(owner);
    const own = await get("comprovantes", "c1.png");
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("image/png");
    expect(own.headers.get("cache-control")).toBe("no-store");

    await actAs(other);
    const denied = await get("comprovantes", "c1.png");
    expect(denied.status).toBe(403);
    expect(denied.json.error).toBe("Este comprovante não é seu.");

    await actAs(await createAdmin());
    expect((await get("comprovantes", "c1.png")).status).toBe(200);
  });

  it("comprovante inexistente para o organizador: 404", async () => {
    await actAs(await createAdmin());
    expect((await get("comprovantes", "nada.png")).status).toBe(404);
  });
});
