import { roundBySlugOrCurrent } from "@/lib/api/rounds";
import { subscribeLive } from "@/lib/api/live";
import { ApiError, fail } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/live/planet?round= — Server-Sent Events: planet_stats + pulse every 5 s (replaces Supabase Realtime). */
export async function GET(req: Request) {
  let roundId: string;
  try {
    roundId = (await roundBySlugOrCurrent(new URL(req.url).searchParams.get("round"))).id;
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong on our side.");
  }
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send("hello", { round_id: roundId });
      unsubscribe = subscribeLive(roundId, (tick) => send("tick", tick));
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          /* closed */
        }
      }, 20_000);
      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (keepalive) clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
