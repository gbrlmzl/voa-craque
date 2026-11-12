import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  contentTypeFor,
  localFilePath,
  newPhotoKey,
  readStoredFile,
  saveUpload,
  storeObject,
} from "../../src/lib/storage";
import { restoreEnv, stubEnv } from "../helpers/env";

const png = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: "#16b873" } }).png().toBuffer();

afterEach(() => restoreEnv());

describe("saveUpload (driver local)", () => {
  it("comprovante: grava como veio no UPLOAD_DIR temporario e devolve o caminho de /api/files", async () => {
    const bytes = await png();
    const url = await saveUpload(new File([new Uint8Array(bytes)], "c.png", { type: "image/png" }), "comprovantes");
    expect(url).toMatch(/^\/api\/files\/comprovantes\/[0-9a-f-]{36}\.png$/);
    const stored = readFileSync(path.join(process.env.UPLOAD_DIR!, url.replace("/api/files/", "")));
    expect(Buffer.compare(stored, bytes)).toBe(0);
    expect(process.env.UPLOAD_DIR).toMatch(/voacraque-uploads-/);
  });

  it("foto: sempre WebP 512x512, mesmo que o navegador mande outro tipo", async () => {
    const url = await saveUpload(new File([new Uint8Array(await png())], "f.png", { type: "application/octet-stream" }), "fotos");
    expect(url).toMatch(/^\/api\/files\/fotos\/[0-9a-f-]{36}\.webp$/);
    const meta = await sharp(readFileSync(path.join(process.env.UPLOAD_DIR!, url.replace("/api/files/", "")))).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
  });

  it.each([
    ["comprovante com tipo invalido", () => new File(["x"], "a.gif", { type: "image/gif" }), "comprovantes", /Formato inválido/],
    ["comprovante vazio", () => new File([], "a.png", { type: "image/png" }), "comprovantes", /Arquivo vazio/],
    ["foto vazia", () => new File([], "a.jpg", { type: "image/jpeg" }), "fotos", /Arquivo vazio/],
  ] as const)("%s", async (_label, make, folder, message) => {
    await expect(saveUpload(make(), folder)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
  });

  it("os limites vem de MAX_UPLOAD_MB e MAX_PHOTO_UPLOAD_MB", async () => {
    jest.resetModules();
    stubEnv("MAX_UPLOAD_MB", "1");
    const storage = await import("../../src/lib/storage");
    const big = new File([new Uint8Array(1024 * 1024 + 1)], "g.png", { type: "image/png" });
    await expect(storage.saveUpload(big, "comprovantes")).rejects.toMatchObject({ message: "Arquivo muito grande. O limite é 1 MB." });
  });
});

describe("storeObject / readStoredFile", () => {
  it("grava em subpastas e le de volta; chave inexistente devolve null", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "voacraque-storage-"));
    stubEnv("UPLOAD_DIR", dir);
    expect(await storeObject("fotos/x/y.webp", Buffer.from("abc"), "image/webp")).toBe("/api/files/fotos/x/y.webp");
    expect((await readStoredFile("fotos/x/y.webp"))?.toString()).toBe("abc");
    expect(await readStoredFile("fotos/nada.webp")).toBeNull();
  });

  it("o driver s3 sem bucket configurado recusa com mensagem clara (sem tocar na rede)", async () => {
    stubEnv("STORAGE_DRIVER", "s3");
    stubEnv("S3_BUCKET", "");
    stubEnv("S3_REGION", "");
    await expect(storeObject("fotos/a.webp", Buffer.from("x"), "image/webp")).rejects.toMatchObject({
      status: 400,
      message: "Armazenamento S3 não configurado. Defina S3_BUCKET e S3_REGION.",
    });
    await expect(readStoredFile("fotos/a.webp")).rejects.toMatchObject({ status: 400 });
  });
});

describe("localFilePath", () => {
  it("fica sempre dentro do diretorio de uploads: '..' e '.' sao descartados", () => {
    const root = path.resolve(process.env.UPLOAD_DIR!);
    expect(localFilePath(["fotos", "a.webp"])).toBe(path.join(root, "fotos", "a.webp"));
    expect(localFilePath(["fotos", "..", "..", "segredo"])).toBe(path.join(root, "fotos", "segredo"));
    expect(localFilePath([".", "", "a"])).toBe(path.join(root, "a"));
  });

  it("caminho relativo em UPLOAD_DIR parte do diretorio de trabalho", () => {
    stubEnv("UPLOAD_DIR", "./uploads-teste");
    expect(localFilePath(["a"])).toBe(path.join(process.cwd(), "uploads-teste", "a"));
  });
});

describe("contentTypeFor / newPhotoKey", () => {
  it("tipo pela extensao, jpeg como padrao", () => {
    expect(contentTypeFor("a.png")).toBe("image/png");
    expect(contentTypeFor("a.webp")).toBe("image/webp");
    expect(contentTypeFor("a.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("a")).toBe("image/jpeg");
  });
  it("chaves de foto sao unicas", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newPhotoKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^fotos\/[0-9a-f-]{36}\.webp$/);
  });
});
