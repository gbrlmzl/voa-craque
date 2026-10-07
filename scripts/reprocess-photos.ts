import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { normalizeProfilePhoto } from "@/lib/profile-photo";
import { newPhotoKey, readStoredFile, storeObject } from "@/lib/storage";

/**
 * Reduz as fotos de perfil enviadas antes da normalizacao (JPEG/PNG de varios
 * MB) para WebP 512x512, gravando um objeto novo e apontando o perfil para ele.
 * Sem --apply so simula: processa em memoria e mostra a economia, sem gravar nada.
 * Nunca apaga o original: as chaves que ficaram sem uso saem no fim para o
 * usuario remover a mao ou por uma regra de ciclo de vida do bucket.
 * Rodar: npx tsx scripts/reprocess-photos.ts [--apply]
 */
const PREFIX = "/api/files/";
const apply = process.argv.includes("--apply");

function format(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const profiles = await prisma.playerProfile.findMany({
    where: {
      photoUrl: { startsWith: `${PREFIX}fotos/`, not: { endsWith: ".webp" } },
    },
    select: { id: true, name: true, photoUrl: true },
  });

  console.log(
    `[reprocess-photos] ${profiles.length} foto(s) para processar${apply ? "" : " (simulacao: nada sera gravado)"}`,
  );

  let before = 0;
  let after = 0;
  let failed = 0;
  const unused: string[] = [];

  // Uma foto por vez: a normalizacao ja e serializada e o script nao precisa de pressa.
  for (const profile of profiles) {
    const oldUrl = profile.photoUrl!;
    const oldKey = oldUrl.slice(PREFIX.length);
    try {
      const original = await readStoredFile(oldKey);
      if (!original) throw new Error("arquivo nao encontrado no armazenamento");

      const normalized = await normalizeProfilePhoto(original);
      before += original.length;
      after += normalized.length;

      if (apply) {
        const newUrl = await storeObject(newPhotoKey(), normalized, "image/webp");
        // So troca se o perfil ainda aponta para a foto lida: se o jogador enviou
        // outra nesse meio tempo, a dele vence e o objeto novo fica como sobra.
        const { count } = await prisma.playerProfile.updateMany({
          where: { id: profile.id, photoUrl: oldUrl },
          data: { photoUrl: newUrl },
        });
        if (count === 0) {
          unused.push(newUrl.slice(PREFIX.length));
          console.log(`[reprocess-photos] ${profile.name}: foto trocada durante o processo, mantida a nova do jogador`);
          continue;
        }
        unused.push(oldKey);
      }

      console.log(`[reprocess-photos] ${profile.name}: ${format(original.length)} -> ${format(normalized.length)}`);
    } catch (error) {
      failed++;
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[reprocess-photos] ${profile.name} (${oldKey}) falhou: ${reason}`);
      process.exitCode = 1;
    }
  }

  const done = profiles.length - failed;
  console.log(
    `[reprocess-photos] ${done} de ${profiles.length} ok, ${failed} com erro. Total ${format(before)} -> ${format(after)}`,
  );

  if (!apply) {
    console.log("[reprocess-photos] Simulacao concluida. Confira o resultado e rode de novo com --apply.");
    return;
  }

  if (unused.length > 0) {
    console.log("[reprocess-photos] Chaves sem uso (nada foi apagado; remova quando quiser):");
    for (const key of unused) console.log(`  ${key}`);
  }
}

main().finally(() => prisma.$disconnect());
