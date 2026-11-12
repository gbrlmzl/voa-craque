// EventSource controlavel: o teste emite eventos e simula queda da conexao.
type Listener = (event: { data?: string }) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static get last(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }
  static reset() {
    FakeEventSource.instances = [];
  }

  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {
    this.closed = true;
  }

  /** Dispara um evento nomeado ("snapshot", "open", "error"). `data` vai como texto JSON. */
  emit(type: string, data?: unknown) {
    const payload = data === undefined ? {} : { data: typeof data === "string" ? data : JSON.stringify(data) };
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }
}
