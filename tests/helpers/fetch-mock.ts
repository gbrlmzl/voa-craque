// fetch com tabela de rotas: "METODO /caminho" -> resposta. Chamar uma rota que o teste
// nao previu falha o teste na hora, em vez de devolver undefined e quebrar la na frente.
export type MockResponse = { status?: number; body?: unknown; headers?: Record<string, string> };
export type RouteTable = Record<string, MockResponse | ((init: RequestInit | undefined, url: string) => MockResponse | Promise<MockResponse>)>;

export type FetchCall = { method: string; url: string; path: string; body: unknown; init?: RequestInit };

let calls: FetchCall[] = [];

// O jsdom nao traz Response; o app so usa ok, status, headers, json() e text().
class FakeResponse {
  readonly ok: boolean;
  readonly headers: Headers | Map<string, string>;
  constructor(
    private readonly payload: string | null,
    readonly status: number,
    headers: Record<string, string>,
  ) {
    this.ok = status >= 200 && status < 300;
    this.headers = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  }
  async json() {
    return JSON.parse(this.payload ?? "null");
  }
  async text() {
    return this.payload ?? "";
  }
  clone() {
    return new FakeResponse(this.payload, this.status, Object.fromEntries(this.headers as Map<string, string>));
  }
}

export function mockFetch(routes: RouteTable) {
  calls = [];
  if (typeof global.fetch !== "function") global.fetch = jest.fn() as unknown as typeof fetch;
  (global.fetch as jest.Mock).mockClear?.();
  const spy = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.split("?")[0];
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // texto puro
      }
    }
    calls.push({ method, url, path, body, init });

    const entry = routes[`${method} ${url}`] ?? routes[`${method} ${path}`];
    if (!entry) {
      throw new Error(`fetch nao previsto no teste: ${method} ${url}\nPrevistos: ${Object.keys(routes).join(", ") || "(nenhum)"}`);
    }
    const resolved = typeof entry === "function" ? await entry(init, url) : entry;
    const status = resolved.status ?? 200;
    return new FakeResponse(status === 204 ? null : JSON.stringify(resolved.body ?? {}), status, {
      "content-type": "application/json",
      ...resolved.headers,
    }) as unknown as Response;
  });
  return spy;
}

export function fetchCalls(): FetchCall[] {
  return [...calls];
}
export function fetchCallsTo(method: string, path: string): FetchCall[] {
  return calls.filter((call) => call.method === method && call.path === path);
}
