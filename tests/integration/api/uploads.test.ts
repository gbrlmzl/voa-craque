import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { POST } from "@/app/api/uploads/route";
import { callRoute } from "../../helpers/route";
import { fixtureFile } from "../../helpers/fixtures";
import { createPlayer } from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

function upload(file: File | null, tipo?: string) {
  const form = new FormData();
  if (file) form.set("file", file);
  if (tipo) form.set("tipo", tipo);
  return callRoute(POST, { method: "POST", path: "/api/uploads", formData: form });
}

describe("POST /api/uploads", () => {
  it("sem sessao: 401", async () => {
    asVisitor();
    expect((await upload(fixtureFile("foto.jpg"))).status).toBe(401);
  });

  it("foto 3000x2000 vira WebP 512x512 e fica no UPLOAD_DIR temporario", async () => {
    await actAs(await createPlayer());
    const res = await upload(fixtureFile("foto.jpg"), "foto");
    expect(res.status).toBe(200);
    expect(res.json.url).toMatch(/^\/api\/files\/fotos\/[0-9a-f-]+\.webp$/);

    const stored = await readFile(path.join(process.env.UPLOAD_DIR!, res.json.url.replace("/api/files/", "")));
    const meta = await sharp(stored).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(stored.length).toBeLessThan(150_000);
    expect(process.env.UPLOAD_DIR).toMatch(/voacraque-uploads-/);
  });

  it("o tipo padrao e foto", async () => {
    await actAs(await createPlayer());
    expect((await upload(fixtureFile("foto.jpg"))).json.url).toMatch(/\/fotos\//);
  });

  it("comprovante e gravado como veio", async () => {
    await actAs(await createPlayer());
    const file = fixtureFile("comprovante.png");
    const res = await upload(file, "comprovante");
    expect(res.status).toBe(200);
    expect(res.json.url).toMatch(/^\/api\/files\/comprovantes\/[0-9a-f-]+\.png$/);
    const stored = await readFile(path.join(process.env.UPLOAD_DIR!, res.json.url.replace("/api/files/", "")));
    expect(Buffer.compare(stored, Buffer.from(await file.arrayBuffer()))).toBe(0);
  });

  it("comprovante que nao e imagem: 400", async () => {
    await actAs(await createPlayer());
    const res = await upload(fixtureFile("nao-imagem.txt"), "comprovante");
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
  });

  it("foto que e texto com tipo de imagem tambem e recusada (o servidor nao confia no file.type)", async () => {
    await actAs(await createPlayer());
    const res = await upload(fixtureFile("nao-imagem.txt", "image/png"), "foto");
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
  });

  it("comprovante acima de 5 MB: 400", async () => {
    await actAs(await createPlayer());
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.png", { type: "image/png" });
    const res = await upload(big, "comprovante");
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Arquivo muito grande. O limite é 5 MB.");
  });

  it("arquivo vazio, sem arquivo e tipo desconhecido: 400", async () => {
    await actAs(await createPlayer());
    expect((await upload(new File([], "vazio.png", { type: "image/png" }), "comprovante")).json.error).toBe("Arquivo vazio.");
    expect((await upload(null, "foto")).json.error).toBe("Nenhum arquivo enviado.");
    expect((await upload(fixtureFile("foto.jpg"), "video")).json.error).toBe("Tipo de arquivo desconhecido.");
  });

  it("corpo acima do teto do proxy: 400 com mensagem", async () => {
    await actAs(await createPlayer());
    const form = new FormData();
    form.set("file", fixtureFile("foto.jpg"));
    const res = await callRoute(POST, { method: "POST", formData: form, headers: { "content-length": String(30 * 1024 * 1024) } });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Arquivo muito grande. Escolha uma imagem menor.");
  });

  it("corpo que nao e multipart: 400", async () => {
    await actAs(await createPlayer());
    const res = await callRoute(POST, { method: "POST", body: { qualquer: "coisa" } });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Não foi possível ler o arquivo enviado.");
  });
});
