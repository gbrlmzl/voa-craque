import sharp from "sharp";
import { badRequest, HttpError } from "@/lib/http";

/** Lado do quadrado gravado. O maior uso hoje e 336 px fisicos (avatar xl em DPR 3 e o story). */
export const PHOTO_SIZE = 512;
const PHOTO_QUALITY = 82;
// Acima disso nem decodifica: protege os 2 GB da t4g contra "bomba de pixels".
const DEFAULT_MAX_INPUT_PIXELS = 100_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Cache interno do libvips desligado: cada foto e processada uma vez so.
sharp.cache(false);

// Uma normalizacao por vez: a t4g divide 2 GB de RAM com o Postgres, e duas
// fotos de 50 MP decodificando juntas nao cabem com folga.
let tail: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

const INVALID_FORMAT = "Formato inválido. Envie uma imagem JPEG, PNG ou WebP.";

/** O sharp so expoe o motivo pela mensagem: "Input image exceeds pixel limit". */
function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

/**
 * Normaliza a foto de perfil: confere que e imagem de verdade (nao confia no
 * file.type do navegador), gira pelo EXIF, recorta o quadrado central e grava
 * WebP sem metadados (o EXIF de celular traz GPS).
 * `maxInputPixels` so e injetavel para o teste nao precisar de 100 MP.
 */
export function normalizeProfilePhoto(
  input: Buffer,
  { maxInputPixels = DEFAULT_MAX_INPUT_PIXELS }: { maxInputPixels?: number } = {},
): Promise<Buffer> {
  return oneAtATime(async () => {
    try {
      const image = sharp(input, { limitInputPixels: maxInputPixels, failOn: "error" });
      // Ate o metadata() lanca no limite de pixels, entao o erro precisa ser
      // distinguido aqui: senao uma foto enorme viraria "formato invalido".
      const meta = await image.metadata();
      if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw badRequest(INVALID_FORMAT);

      return await image
        .rotate()
        .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover", position: "centre" })
        .webp({ quality: PHOTO_QUALITY, effort: 4 })
        .toBuffer();
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (isPixelLimitError(error)) {
        throw badRequest("Imagem muito grande em resolução. Reduza a foto e tente de novo.");
      }
      // Texto no lugar da imagem, arquivo cortado ou corrompido.
      throw badRequest(INVALID_FORMAT);
    }
  });
}
