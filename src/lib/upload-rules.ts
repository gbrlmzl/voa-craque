/**
 * Regras de arquivo de imagem que o navegador confere antes de enviar, com a
 * mesma mensagem do servidor (src/lib/storage.ts). Fica a parte do storage de
 * proposito: aquele modulo le process.env e carrega o SDK do S3, e nao pode ir
 * para o navegador. Os limites do servidor sao configuraveis por ambiente e
 * continuam sendo a palavra final; aqui so se antecipa o aviso com os padroes.
 */

export const ACCEPTED_IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

export const PHOTO_MAX_MB = 20;
export const RECEIPT_MAX_MB = 5;

/** Devolve a mensagem de erro, ou null se o arquivo serve. */
export function checkImageFile(file: { type: string; size: number }, maxMb: number): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Formato inválido. Envie uma imagem JPEG, PNG ou WebP.";
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `Arquivo muito grande. O limite é ${maxMb} MB.`;
  }
  if (file.size === 0) {
    return "Arquivo vazio.";
  }
  return null;
}
