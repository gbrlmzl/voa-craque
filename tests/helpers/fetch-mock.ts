// fetch com tabela de rotas: "METODO /caminho" -> resposta. Chamar uma rota que o teste
// nao previu falha o teste na hora, em vez de devolver undefined e quebrar la na frente.
export type MockResponse = { status?: number; body?: unknown; headers?: Record<string, string> };
export type RouteTable = Record<string, MockResponse | ((init: RequestInit | undefined, url: string) => MockResponse | Promise<MockResponse>)>;

export type FetchCall = { method: string; url: string; path: string; body: unknown; init?: RequestInit };

let calls: FetchCall[] = [];

export function mockFetch(routes: RouteTable) {
  calls = [];
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
    return new Response(status === 204 ? null : JSON.stringify(resolved.body ?? {}), {
      status,
      headers: { "content-type": "application/json", ...resolved.headers },
    });
  });
  return spy;
}

export function fetchCalls(): FetchCall[] {
  return [...calls];
}
export function fetchCallsTo(method: string, path: string): FetchCall[] {
  return calls.filter((call) => call.method === method && call.path === path);
}
