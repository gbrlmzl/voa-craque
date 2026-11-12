import { shrinkBeforeUpload } from "@/lib/client-image";

const file = (size: number, name = "foto.png", type = "image/png") => new File([new Uint8Array(size)], name, { type });
const MB = 1024 * 1024;

function stubBrowser({ toBlobSize, width = 4000, height = 3000, fail = false }: { toBlobSize?: number | null; width?: number; height?: number; fail?: boolean }) {
  const close = jest.fn();
  Object.defineProperty(global, "createImageBitmap", {
    configurable: true,
    writable: true,
    value: fail ? jest.fn().mockRejectedValue(new Error("heic")) : jest.fn().mockResolvedValue({ width, height, close }),
  });
  const drawImage = jest.fn();
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
  jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((callback: BlobCallback) =>
    callback(toBlobSize === null ? null : new Blob([new Uint8Array(toBlobSize ?? 500_000)], { type: "image/jpeg" }))) as never);
  return { close, drawImage, getContext };
}

describe("shrinkBeforeUpload", () => {
  it("arquivo pequeno (ate 1,5 MB) segue como esta", async () => {
    const original = file(MB);
    expect(await shrinkBeforeUpload(original)).toBe(original);
  });

  it("foto grande vira JPEG menor, com o lado maior em 1600 px e a extensao trocada", async () => {
    const browser = stubBrowser({});
    const result = await shrinkBeforeUpload(file(4 * MB, "minha.foto.png"));
    expect(result.name).toBe("minha.foto.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBeLessThan(4 * MB);
    expect(browser.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(browser.close).toHaveBeenCalled();
  });

  it("imagem ja menor que o limite nao e ampliada", async () => {
    const browser = stubBrowser({ width: 800, height: 600 });
    await shrinkBeforeUpload(file(4 * MB));
    expect(browser.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
  });

  it("se a reducao nao compensar (ficou maior ou igual), manda o original", async () => {
    stubBrowser({ toBlobSize: 5 * MB });
    const original = file(4 * MB);
    expect(await shrinkBeforeUpload(original)).toBe(original);
  });

  it("canvas sem blob ou sem suporte ao formato: original", async () => {
    stubBrowser({ toBlobSize: null });
    const original = file(4 * MB);
    expect(await shrinkBeforeUpload(original)).toBe(original);
  });

  it("navegador que nao decodifica (HEIC): original, sem erro", async () => {
    stubBrowser({ fail: true });
    const original = file(4 * MB, "iphone.heic", "image/heic");
    expect(await shrinkBeforeUpload(original)).toBe(original);
  });
});
