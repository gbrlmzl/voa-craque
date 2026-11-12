// Roda antes de qualquer import. A suite nunca herda S3, SMTP ou Google do .env
// de quem a executa. Strings vazias, nao `delete`: o dotenv reinsere chave ausente.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.STORAGE_DRIVER = "local";
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "voacraque-uploads-"));
process.env.MAIL_DRIVER = "console";
for (const key of [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_BASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
]) {
  process.env[key] = "";
}
