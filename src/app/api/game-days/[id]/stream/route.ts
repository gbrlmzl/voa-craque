import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { subscribeGameDay } from "@/lib/realtime";
import { buildLiveSnapshot } from "@/services/live";
import { syncMatchClock } from "@/services/match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLOCK_TICK_MS = 1000;
const HEARTBEAT_MS = 15000;

/**
 * Canal ao vivo por SSE. Cada mudanca na pelada empurra um snapshot completo;
 * o cliente so precisa redesenhar. O tique de 1s existe para encerrar a partida
 * quando o cronometro zera, mesmo sem ninguem tocar em nada.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastBeat = Date.now();

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const push = async () => {
        if (closed) return;
        try {
          const snapshot = await buildLiveSnapshot(id);
          write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
          lastBeat = Date.now();
        } catch (error) {
          write(`event: erro\ndata: ${JSON.stringify({ message: String(error) })}\n\n`);
        }
      };

      const unsubscribe = subscribeGameDay(id, () => {
        void push();
      });

      const ticker = setInterval(() => {
        if (closed) return;
        void syncMatchClock(id).then(() => {
          if (Date.now() - lastBeat >= HEARTBEAT_MS) {
            write(": ping\n\n");
            lastBeat = Date.now();
          }
        });
      }, CLOCK_TICK_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ticker);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // conexao ja encerrada pelo cliente
        }
      };

      req.signal.addEventListener("abort", close);
      await push();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
