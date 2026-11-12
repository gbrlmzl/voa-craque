import { ACCEPTED_IMAGE_TYPES, PHOTO_MAX_MB, RECEIPT_MAX_MB, checkImageFile } from "../../src/lib/upload-rules";

const MB = 1024 * 1024;

describe("checkImageFile", () => {
  it("aceita cada tipo permitido", () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(checkImageFile({ type, size: 100 * 1024 }, RECEIPT_MAX_MB)).toBeNull();
    }
    expect(ACCEPTED_IMAGE_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("recusa PDF e outros formatos com a mensagem do servidor", () => {
    const message = "Formato inválido. Envie uma imagem JPEG, PNG ou WebP.";
    expect(checkImageFile({ type: "application/pdf", size: 1000 }, RECEIPT_MAX_MB)).toBe(message);
    expect(checkImageFile({ type: "image/gif", size: 1000 }, RECEIPT_MAX_MB)).toBe(message);
    expect(checkImageFile({ type: "", size: 1000 }, RECEIPT_MAX_MB)).toBe(message);
  });

  it("recusa arquivo vazio", () => {
    expect(checkImageFile({ type: "image/png", size: 0 }, RECEIPT_MAX_MB)).toBe("Arquivo vazio.");
  });

  it("aceita exatamente no limite e recusa 1 byte acima", () => {
    expect(checkImageFile({ type: "image/jpeg", size: 5 * MB }, RECEIPT_MAX_MB)).toBeNull();
    expect(checkImageFile({ type: "image/jpeg", size: 5 * MB + 1 }, RECEIPT_MAX_MB)).toBe(
      "Arquivo muito grande. O limite é 5 MB.",
    );
    expect(checkImageFile({ type: "image/jpeg", size: 20 * MB }, PHOTO_MAX_MB)).toBeNull();
    expect(checkImageFile({ type: "image/jpeg", size: 20 * MB + 1 }, PHOTO_MAX_MB)).toBe(
      "Arquivo muito grande. O limite é 20 MB.",
    );
  });

  it("confere o tipo antes do tamanho, como o servidor", () => {
    expect(checkImageFile({ type: "application/pdf", size: 50 * MB }, RECEIPT_MAX_MB)).toBe(
      "Formato inválido. Envie uma imagem JPEG, PNG ou WebP.",
    );
  });

  it("usa os limites padrao do servidor", () => {
    expect(PHOTO_MAX_MB).toBe(20);
    expect(RECEIPT_MAX_MB).toBe(5);
  });
});
