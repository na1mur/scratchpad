import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { subscribe, type SolutionEvent } from "@/lib/ai/pipeline/events";
import { getOwnedSolution } from "@/lib/solutions";

export const maxDuration = 300;

const HEARTBEAT_MS = 15_000;

/**
 * Streams a solution run's progress as server-sent events. Any page can open
 * it at any time, so it works after navigating from the workspace and after a
 * reload. It starts with the stored status, then relays the pipeline's
 * events; each heartbeat also re-reads the stored status, which ends the
 * stream for a run in another process or one that died.
 */
export function GET(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]/events">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    // Ownership check (and 404) before any stream is opened.
    await getOwnedSolution(session.userId, id);

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        let last: string | null = null;
        const write = (chunk: string) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            open = false;
          }
        };
        const send = (e: SolutionEvent) => {
          if (e.type === "status") {
            if (e.status === last) return;
            last = e.status;
          }
          write(`data: ${JSON.stringify(e)}\n\n`);
          if (e.type === "done" || e.type === "error") cleanup();
        };
        /** Sends the stored state; the stale check in getOwnedSolution turns a dead run into an error. */
        const sync = async () => {
          try {
            const s = await getOwnedSolution(session.userId, id);
            if (s.status === "done") send({ type: "done" });
            else if (s.status === "error") {
              send({ type: "error", code: s.error?.code ?? "error", message: s.error?.message ?? "Writing the solution failed." });
            } else send({ type: "status", status: s.status });
          } catch {
            // Deleted meanwhile: nothing more will happen to it.
            send({ type: "error", code: "not_found", message: "This solution no longer exists." });
          }
        };

        // Subscribe before reading the stored status, so nothing emitted in between is missed.
        const unsubscribe = subscribe<SolutionEvent>(id, send);
        const heartbeat = setInterval(() => {
          write(": ping\n\n");
          void sync();
        }, HEARTBEAT_MS);
        cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {}
          }
        };
        void sync();
      },
      cancel() {
        cleanup();
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
  });
}
