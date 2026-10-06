/**
 * Reduz a foto no navegador antes do upload, so para economizar dados em 4G.
 * O servidor normaliza de novo de qualquer jeito; se algo aqui falhar (HEIC
 * no Chrome, navegador antigo), manda o arquivo original.
 */
export async function shrinkBeforeUpload(file: File, maxSide = 1600, quality = 0.9): Promise<File> {
  if (file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
