import type { NextRequest } from "next/server";
import { badRequest, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { saveUpload, type UploadFolder } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mesmo teto do proxyClientMaxBodySize em next.config.ts: acima dele o proxy corta o corpo
// e o formData() quebraria com 500 em vez de uma mensagem para o usuario.
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const FOLDERS: Record<string, UploadFolder> = {
  foto: "fotos",
  comprovante: "comprovantes",
};

export async function POST(req: NextRequest) {
  return route(async () => {
    await requireUser();

    if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
      throw badRequest("Arquivo muito grande. Escolha uma imagem menor.");
    }

    const form = await req.formData().catch(() => {
      throw badRequest("Não foi possível ler o arquivo enviado.");
    });
    const file = form.get("file");
    const kind = String(form.get("tipo") ?? "foto");
    const folder = FOLDERS[kind];

    if (!folder) throw badRequest("Tipo de arquivo desconhecido.");
    if (!(file instanceof File)) throw badRequest("Nenhum arquivo enviado.");

    const url = await saveUpload(file, folder);
    return { url };
  });
}
