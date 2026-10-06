/**
 * LRU em memoria limitado por bytes. Evita ir ao S3 a cada foto ja lida
 * recentemente. Sem invalidacao: a chave e um UUID novo a cada upload e o
 * arquivo nunca e reescrito.
 */
export class ByteLru {
  private readonly items = new Map<string, Buffer>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly maxItemBytes: number;

  constructor({ maxBytes, maxItemBytes }: { maxBytes: number; maxItemBytes: number }) {
    this.maxBytes = maxBytes;
    this.maxItemBytes = maxItemBytes;
  }

  get(key: string): Buffer | undefined {
    const value = this.items.get(key);
    if (!value) return undefined;
    // O Map guarda a ordem de insercao: reinserir leva o item para o fim (o mais recente).
    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  set(key: string, value: Buffer): void {
    // Foto antiga ainda nao reprocessada (varios MB) nao pode ocupar o cache inteiro.
    if (value.length > this.maxItemBytes) return;

    const previous = this.items.get(key);
    if (previous) {
      this.bytes -= previous.length;
      this.items.delete(key);
    }

    this.items.set(key, value);
    this.bytes += value.length;

    // O primeiro do Map e o usado ha mais tempo.
    for (const oldest of this.items.keys()) {
      if (this.bytes <= this.maxBytes) break;
      this.bytes -= this.items.get(oldest)!.length;
      this.items.delete(oldest);
    }
  }

  get size(): number {
    return this.items.size;
  }

  get totalBytes(): number {
    return this.bytes;
  }
}

const globalForPhotoCache = globalThis as unknown as { photoCache?: ByteLru };

// Uma instancia por processo; no globalThis para sobreviver ao hot reload no dev
// (mesmo padrao do prisma). 32 MB cabem ~800 fotos de 40 KB.
export const photoCache =
  globalForPhotoCache.photoCache ??
  new ByteLru({ maxBytes: 32 * 1024 * 1024, maxItemBytes: 512 * 1024 });

globalForPhotoCache.photoCache = photoCache;
