import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound, toErrorResponse } from "@/lib/http";
import { photoCache } from "@/lib/photo-cache";
import { isAdmin, requireUser } from "@/lib/session";
import { contentTypeFor, localFilePath, readStoredFile, signedS3Url } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve os arquivos independente do driver. Comprovante de pagamento e dado
 * sensivel: so o dono da inscricao e os organizadores enxergam. No driver s3
 * o bucket fica privado, entao so redireciona depois de confirmar o acesso.
 *
 * A foto de perfil nao usa o redirect: a URL assinada muda a cada chamada, o que
 * impedia o navegador de guardar a foto, e ela so tem ~40 KB. Servida daqui, a URL
 * nunca muda e o arquivo nunca e reescrito (a chave e um UUID novo por upload), entao
 * pode ser imutavel por um ano. `private` impede a Cloudflare de guardar uma foto
 * que exige login.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await requireUser();
    const { path: segments } = await ctx.params;

    if (segments[0] === "fotos") {
      const key = segments.join("/");
      let photo = photoCache.get(key);
      if (!photo) {
        // Arquivo inexistente vira 404 e nunca chega a receber o cache imutavel.
        const stored = await readStoredFile(key);
        if (!stored) throw notFound("Arquivo não encontrado.");
        photoCache.set(key, stored);
        photo = stored;
      }

      return new NextResponse(new Uint8Array(photo), {
        headers: {
          "Content-Type": contentTypeFor(segments.at(-1) ?? ""),
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    }

    if (segments[0] === "comprovantes" && !isAdmin(user)) {
      const url = `/api/files/${segments.join("/")}`;
      const owned = await prisma.registration.findFirst({
        where: { receiptUrl: url, userId: user.id },
        select: { id: true },
      });
      if (!owned) throw forbidden("Este comprovante não é seu.");
    }

    if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
      const signedUrl = await signedS3Url(segments.join("/"));
      const redirect = NextResponse.redirect(signedUrl, { status: 302 });
      // Comprovante e dado sensivel: nenhum cache pode guardar o redirect.
      redirect.headers.set("Cache-Control", "no-store");
      return redirect;
    }

    const file = await readFile(localFilePath(segments)).catch(() => null);
    if (!file) throw notFound("Arquivo não encontrado.");

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeFor(segments.at(-1) ?? ""),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
