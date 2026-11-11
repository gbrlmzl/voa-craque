import { NextRequest } from "next/server";
import { cookieJar } from "./next-env";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;

export type RouteResult<T = any> = {
  status: number;
  json: T;
  headers: Headers;
  response: Response;
};

export type RouteCall = {
  method?: string;
  path?: string;
  body?: unknown;
  /** FormData ou JSON: o corpo ja pronto. */
  formData?: FormData;
  params?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
};

/** Monta o NextRequest, chama o handler exportado da rota e devolve status e JSON. */
export async function callRoute<T = any>(handler: Handler, call: RouteCall = {}): Promise<RouteResult<T>> {
  const method = call.method ?? "GET";
  const headers = new Headers(call.headers);
  const cookies = { ...cookieJar(), ...call.cookies };
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  if (cookieHeader) headers.set("cookie", cookieHeader);

  let body: BodyInit | undefined;
  if (call.formData) {
    body = call.formData;
  } else if (call.body !== undefined) {
    body = JSON.stringify(call.body);
    headers.set("content-type", "application/json");
  }

  const req = new NextRequest(`http://localhost:3100${call.path ?? "/"}`, { method, headers, body });
  const response = await handler(req, { params: Promise.resolve(call.params ?? {}) });
  const text = response.body ? await response.text() : "";
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json: json as T, headers: response.headers, response };
}

/** Le os primeiros `count` eventos de um stream SSE e fecha a conexao. */
export async function readSse(response: Response, count: number, timeoutMs = 4000) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: any }> = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (events.length < count && Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), Math.max(1, deadline - Date.now())),
        ),
      ]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (event && data) events.push({ event, data: JSON.parse(data) });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return events;
}
