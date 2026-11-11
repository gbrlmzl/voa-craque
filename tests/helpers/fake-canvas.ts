// Contexto 2D falso para o jsdom: guarda cada chamada de desenho para o teste conferir.
export type DrawCall = { method: string; args: unknown[] };

export function installFakeCanvas() {
  const calls: DrawCall[] = [];
  const props: Record<string, unknown> = {};

  const gradient = () => ({ addColorStop: jest.fn() });
  const ctx = new Proxy(
    {},
    {
      get(_target, name: string) {
        if (name === "measureText") {
          return (text: string) => {
            calls.push({ method: name, args: [text] });
            const size = Number(/(\d+)px/.exec(String(props.font))?.[1] ?? 16);
            return { width: text.length * size * 0.5 };
          };
        }
        if (name === "createLinearGradient" || name === "createRadialGradient") {
          return (...args: unknown[]) => {
            calls.push({ method: name, args });
            return gradient();
          };
        }
        if (name in props) return props[name];
        return (...args: unknown[]) => {
          calls.push({ method: name, args });
        };
      },
      set(_target, name: string, value: unknown) {
        props[name] = value;
        return true;
      },
    },
  );

  class FakePath2D {
    constructor(readonly d?: string) {}
  }

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = jest.fn(function (callback: BlobCallback) {
    callback(new Blob(["png"], { type: "image/png" }));
  }) as never;
  Object.defineProperty(global, "Path2D", { configurable: true, writable: true, value: FakePath2D });
  Object.defineProperty(window, "Path2D", { configurable: true, writable: true, value: FakePath2D });
  Object.defineProperty(global, "Image", { configurable: true, writable: true, value: FakeImage });
  Object.defineProperty(window, "Image", { configurable: true, writable: true, value: FakeImage });

  return {
    calls,
    props,
    texts: () => calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0])),
    restore() {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    },
  };
}
