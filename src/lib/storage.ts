import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { badRequest } from "@/lib/http";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 5);
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export type UploadFolder = "fotos" | "comprovantes";

function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR ?? "./uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function assertValid(file: File): string {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw badRequest("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw badRequest(`Arquivo muito grande. O limite é ${MAX_UPLOAD_MB} MB.`);
  }
  if (file.size === 0) {
    throw badRequest("Arquivo vazio.");
  }
  return extension;
}

async function saveToS3(key: string, bytes: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  if (!bucket || !region) {
    throw badRequest("Armazenamento S3 não configurado. Defina S3_BUCKET e S3_REGION.");
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  const client = new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
  );

  const base = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${key}` : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Grava foto de perfil ou comprovante e devolve a URL publica do arquivo.
 * O driver local escreve no volume montado; o driver s3 sobe para o bucket.
 */
export async function saveUpload(file: File, folder: UploadFolder): Promise<string> {
  const extension = assertValid(file);
  const key = `${folder}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    return saveToS3(key, bytes, file.type);
  }

  const target = path.join(uploadDir(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `/api/arquivos/${key}`;
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
