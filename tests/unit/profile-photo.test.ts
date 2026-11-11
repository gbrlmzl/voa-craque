import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http";
import { PHOTO_SIZE, normalizeProfilePhoto } from "@/lib/profile-photo";

// Imagens geradas com o proprio sharp: nenhum arquivo binario no repositorio.

/** Metade esquerda vermelha, metade direita azul. */
async function redBlue(orientation?: number): Promise<Buffer> {
  const width = 200;
  const height = 100;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      if (x < width / 2) raw[offset] = 255;
      else raw[offset + 2] = 255;
    }
  }
  const image = sharp(raw, { raw: { width, height, channels: 3 } });
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg({ quality: 95 }).toBuffer();
}

async function pixel(webp: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

async function rejection(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
}

describe("normalizeProfilePhoto", () => {
  it("reduz uma foto de camera (4000x3000) para WebP 512x512 com menos de 100 KB", async () => {
    const original = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const output = await normalizeProfilePhoto(original);
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(PHOTO_SIZE);
    expect(meta.height).toBe(PHOTO_SIZE);
    expect(output.length).toBeLessThan(100 * 1024);
    expect(output.length).toBeLessThan(original.length / 10);
  }, 30_000);

  it("aplica a rotacao do EXIF (orientation 6 gira 90 graus para a direita)", async () => {
    // 200x100 com a esquerda vermelha: girada, o vermelho vai para cima e o azul para baixo.
    const output = await normalizeProfilePhoto(await redBlue(6));

    const [topR, , topB] = await pixel(output, PHOTO_SIZE / 2, 60);
    const [bottomR, , bottomB] = await pixel(output, PHOTO_SIZE / 2, PHOTO_SIZE - 60);

    expect(topR).toBeGreaterThan(200);
    expect(topB).toBeLessThan(80);
    expect(bottomB).toBeGreaterThan(200);
    expect(bottomR).toBeLessThan(80);
  });

  it("sem orientation a imagem fica como veio (esquerda vermelha, direita azul)", async () => {
    const output = await normalizeProfilePhoto(await redBlue());

    const [leftR] = await pixel(output, 40, PHOTO_SIZE / 2);
    const [, , rightB] = await pixel(output, PHOTO_SIZE - 40, PHOTO_SIZE / 2);

    expect(leftR).toBeGreaterThan(200);
    expect(rightB).toBeGreaterThan(200);
  });

  it("nao deixa EXIF na saida (o do celular traz GPS)", async () => {
    const withExif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#336699" },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "teste", ImageDescription: "nao deve sobreviver" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const output = await normalizeProfilePhoto(withExif);

    expect((await sharp(output).metadata()).exif).toBeUndefined();
  });

  it("aceita PNG e WebP, e recusa texto mesmo com cara de imagem", async () => {
    const base = { create: { width: 64, height: 64, channels: 3 as const, background: "#abcdef" } };
    const png = await sharp(base).png().toBuffer();
    const webp = await sharp(base).webp().toBuffer();

    expect((await sharp(await normalizeProfilePhoto(png)).metadata()).format).toBe("webp");
    expect((await sharp(await normalizeProfilePhoto(webp)).metadata()).format).toBe("webp");

    const error = await rejection(normalizeProfilePhoto(Buffer.from("isto nao e uma imagem")));
    expect(error.status).toBe(400);
    expect(error.message).toBe("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
  });

  it("recusa formato de imagem fora de JPEG/PNG/WebP", async () => {
    const gif = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ffffff" },
    })
      .gif()
      .toBuffer();

    const error = await rejection(normalizeProfilePhoto(gif));
    expect(error.status).toBe(400);
    expect(error.message).toContain("Formato inválido");
  });

  it("recusa arquivo cortado em vez de gravar uma foto pela metade", async () => {
    const complete = await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 50 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const error = await rejection(normalizeProfilePhoto(complete.subarray(0, complete.length / 2)));
    expect(error.status).toBe(400);
  });

  it("recusa imagem acima do limite de pixels com mensagem propria", async () => {
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#888888" },
    })
      .png()
      .toBuffer();

    const error = await rejection(normalizeProfilePhoto(png, { maxInputPixels: 1_000 }));
    expect(error.status).toBe(400);
    expect(error.message).toContain("Imagem muito grande");
  });

  it("processa varias fotos em sequencia sem misturar os resultados", async () => {
    const [a, b] = await Promise.all([
      normalizeProfilePhoto(await redBlue()),
      normalizeProfilePhoto(await redBlue(6)),
    ]);

    // Sem rotacao a esquerda e vermelha; com rotacao o topo e vermelho.
    expect((await pixel(a, 40, PHOTO_SIZE / 2))[0]).toBeGreaterThan(200);
    expect((await pixel(b, PHOTO_SIZE / 2, 60))[0]).toBeGreaterThan(200);
  });
});
