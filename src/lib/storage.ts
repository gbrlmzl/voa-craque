import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { badRequest } from "@/lib/http";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 5);
// A foto e reduzida para ~40 KB no servidor, entao aceita o arquivo cru da camera
// do celular; o comprovante e gravado como veio e continua com o limite menor.
export const MAX_PHOTO_UPLOAD_MB = Number(process.env.MAX_PHOTO_UPLOAD_MB ?? 20);

export type UploadFolder = "fotos" | "comprovantes";

const LIMITS_MB: Record<UploadFolder, number> = {
  fotos: MAX_PHOTO_UPLOAD_MB,
  comprovantes: MAX_UPLOAD_MB,
};

function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR ?? "./uploads";
  // Volume de uploads resolvido em runtime: o Turbopack nao deve rastrear o projeto inteiro.
  return path.isAbsolute(configured)
    ? configured
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function assertSize(file: File, folder: UploadFolder) {
  const limitMb = LIMITS_MB[folder];
  if (file.size > limitMb * 1024 * 1024) {
    throw badRequest(`Arquivo muito grande. O limite é ${limitMb} MB.`);
  }
  if (file.size === 0) {
    throw badRequest("Arquivo vazio.");
  }
}

function assertValid(file: File, folder: UploadFolder): string {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw badRequest("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
  }
  assertSize(file, folder);
  return extension;
}

function s3Config(): { bucket: string; region: string } {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  if (!bucket || !region) {
    throw badRequest("Armazenamento S3 não configurado. Defina S3_BUCKET e S3_REGION.");
  }
  return { bucket, region };
}

async function s3Client() {
  const { region } = s3Config();
  const { S3Client } = await import("@aws-sdk/client-s3");
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  return new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}

async function saveToS3(key: string, bytes: Buffer, contentType: string): Promise<string> {
  const { bucket } = s3Config();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client();

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
  );

  // Sempre serve pelo proxy autenticado (/api/files), mesmo no driver s3: o bucket
  // fica privado e o comprovante de pagamento nao pode virar link publico direto.
  return `/api/files/${key}`;
}

/**
 * URL assinada e de curta duracao para o driver s3, usada pelo proxy /api/files
 * depois que ele ja confirmou que o usuario pode ver o arquivo.
 */
export async function signedS3Url(key: string): Promise<string> {
  const { bucket } = s3Config();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await s3Client();

  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 60,
  });
}

/**
 * Grava os bytes na chave dada, no driver configurado, e devolve o caminho para
 * buscar o arquivo depois. Tambem usado pelo script de reprocessamento das fotos.
 */
export async function storeObject(key: string, bytes: Buffer, contentType: string): Promise<string> {
  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    return saveToS3(key, bytes, contentType);
  }

  const target = path.join(uploadDir(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `/api/files/${key}`;
}

/** Chave nova para uma foto de perfil normalizada. O UUID muda a cada gravacao. */
export function newPhotoKey(): string {
  return `fotos/${randomUUID()}.webp`;
}

/**
 * Grava foto de perfil ou comprovante e devolve o caminho para buscar o
 * arquivo depois (sempre via /api/files, que aplica o controle de acesso).
 * O driver local escreve no volume montado; o driver s3 sobe para o bucket.
 * A foto e sempre normalizada (WebP 512x512); o comprovante vai como veio.
 */
export async function saveUpload(file: File, folder: UploadFolder): Promise<string> {
  if (folder === "fotos") {
    assertSize(file, folder);
    // Import tardio como o SDK do S3: so quem recebe upload carrega o libvips (/api/files nao).
    const { normalizeProfilePhoto } = await import("@/lib/profile-photo");
    // A saida e sempre WebP, entao o file.type enviado pelo navegador nao decide nada.
    const bytes = await normalizeProfilePhoto(Buffer.from(await file.arrayBuffer()));
    return storeObject(newPhotoKey(), bytes, "image/webp");
  }

  const extension = assertValid(file, folder);
  const key = `${folder}/${randomUUID()}.${extension}`;
  return storeObject(key, Buffer.from(await file.arrayBuffer()), file.type);
}

/** Le o objeto do driver configurado. Devolve null quando ele nao existe. */
export async function readStoredFile(key: string): Promise<Buffer | null> {
  const segments = key.split("/");

  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    const { bucket } = s3Config();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    // Mesma limpeza do caminho local: a chave nunca sobe de pasta.
    const safeKey = segments.filter((part) => part && part !== "." && part !== "..").join("/");

    try {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: safeKey }));
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    } catch (error) {
      const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (name === "NoSuchKey" || $metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  return readFile(localFilePath(segments)).catch(() => null);
}

export function localFilePath(segments: string[]): string {
  const safe = segments.filter((part) => part && part !== "." && part !== "..");
  const target = path.join(uploadDir(), ...safe);
  const root = uploadDir();
  if (!path.resolve(target).startsWith(path.resolve(root))) {
    throw badRequest("Caminho inválido.");
  }
  return target;
}

export function contentTypeFor(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
