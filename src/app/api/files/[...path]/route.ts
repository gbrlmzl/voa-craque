import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound, toErrorResponse } from "@/lib/http";
import { isAdmin, requireUser } from "@/lib/session";
import { contentTypeFor, localFilePath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve os arquivos do driver local. Comprovante de pagamento e dado sensivel:
 * so o dono da inscricao e os organizadores enxergam.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await requireUser();
    const { path: segments } = await ctx.params;

    if (segments[0] === "comprovantes" && !isAdmin(user)) {
      const url = `/api/files/${segments.join("/")}`;
      const owned = await prisma.registration.findFirst({
        where: { receiptUrl: url, userId: user.id },
        select: { id: true },
      });
      if (!owned) throw forbidden("Este comprovante não é seu.");
    }

    const file = await readFile(localFilePath(segments)).catch(() => null);
    if (!file) throw notFound("Arquivo não encontrado.");

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeFor(segments.at(-1) ?? ""),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
