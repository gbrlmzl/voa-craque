import type { NextRequest } from "next/server";
import { badRequest, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { saveUpload, type UploadFolder } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FOLDERS: Record<string, UploadFolder> = {
  foto: "fotos",
  comprovante: "comprovantes",
};

export async function POST(req: NextRequest) {
  return route(async () => {
    await requireUser();

    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("tipo") ?? "foto");
    const folder = FOLDERS[kind];

    if (!folder) throw badRequest("Tipo de arquivo desconhecido.");
    if (!(file instanceof File)) throw badRequest("Nenhum arquivo enviado.");

    const url = await saveUpload(file, folder);
    return { url };
  });
}
