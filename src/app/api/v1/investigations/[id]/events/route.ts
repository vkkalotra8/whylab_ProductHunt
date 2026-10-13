import { withAuth } from '../../../../../../server/auth/guard.ts';
import { getEventHub } from '../../../../../../server/queue/event-hub.ts';
import { badRequest } from '../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../server/auth/types.ts';
import type { StreamEvent } from '../../../../../../server/queue/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    _context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let investigationId = params?.id;

    if (!investigationId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/investigations/[id]/events
      const invIdx = parts.indexOf('investigations');
      if (invIdx !== -1 && parts.length > invIdx + 1) {
        investigationId = parts[invIdx + 1];
      }
    }

    if (!investigationId) {
      throw badRequest('Investigation ID parameter is required', 'MISSING_INVESTIGATION_ID');
    }

    const url = new URL(req.url);
    const headerLastId = req.headers.get('last-event-id');
    const queryLastId = url.searchParams.get('lastEventId');
    const lastEventId = parseInt(headerLastId || queryLastId || '0', 10);

    const eventHub = getEventHub();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;

        let unsubscribe = () => {};

        const sendEvent = (event: StreamEvent) => {
          if (isClosed) return;
          try {
            const dataStr = JSON.stringify(event.payload);
            const sseBlock = `id: ${event.eventId}\nevent: message\ndata: ${dataStr}\n\n`;
            controller.enqueue(encoder.encode(sseBlock));

            // Automatically close stream when terminal event is received
            if (
              event.payload.type === 'completed' ||
              event.payload.type === 'stopped' ||
              (event.payload.type === 'error' && event.payload.fatal)
            ) {
              isClosed = true;
              unsubscribe();
              controller.close();
            }
          } catch {
            isClosed = true;
            unsubscribe();
          }
        };

        unsubscribe = eventHub.subscribe(
          investigationId!,
          (event) => {
            sendEvent(event);
          },
          lastEventId
        );

        // If investigation has already concluded and all historical events were sent
        if (eventHub.isTerminal(investigationId!) && !isClosed) {
          isClosed = true;
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Controller might already be closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  },
  { requiredRole: 'viewer' }
);
