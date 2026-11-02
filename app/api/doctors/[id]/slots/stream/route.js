// GET /api/doctors/:id/slots/stream?date=YYYY-MM-DD (Server-Sent Events)
// The front desk's slot grid, live: every counter with the booking picker open sees a seat taken at
// another counter, in the Gmedic app, or freed by a cancellation within about a second. The payload is
// exactly GET /api/doctors/:id/slots, sent as an `slots` event whenever it changes (also when a slot
// ends or an app hold lapses, since the server re-reads it every second). The stream closes itself
// after a few minutes; EventSource reconnects, and the session is checked again on each connect.
import booking from '../../../../../../services/receptionBooking';
import { requireReceptionistApi } from '../../../../../../lib/apiGuard';

const TICK_MS = 1000;
const PING_MS = 20000;
const LIFETIME_MS = 5 * 60 * 1000;

export async function GET(req, ctx) {
  const { user, response } = await requireReceptionistApi();
  if (response) return response;
  const { id } = await ctx.params;
  const date = new URL(req.url).searchParams.get('date') || '';
  // Bad date or unknown doctor: answer as the plain slots endpoint does, before opening a stream.
  let last;
  try {
    last = JSON.stringify(await booking.slots(user.hospitalId, id, date));
  } catch (err) {
    return Response.json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong. Please try again.' }, { status: err.status || 500 });
  }

  const encoder = new TextEncoder();
  let timer;
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (text) => { if (!closed) controller.enqueue(encoder.encode(text)); };
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        try { controller.close(); } catch { /* already closed by the client */ }
      };
      req.signal.addEventListener('abort', close);
      send(`retry: 3000\nevent: slots\ndata: ${last}\n\n`);
      const opened = Date.now();
      let pinged = opened;
      const tick = async () => {
        if (closed) return;
        if (Date.now() - opened > LIFETIME_MS) return close();
        try {
          const now = JSON.stringify(await booking.slots(user.hospitalId, id, date));
          if (now !== last) { last = now; send(`event: slots\ndata: ${now}\n\n`); pinged = Date.now(); }
        } catch (err) {
          send(`event: problem\ndata: ${JSON.stringify({ error: err.status && err.status < 500 ? err.message : 'Live seat updates stopped.' })}\n\n`);
          return close();
        }
        if (Date.now() - pinged > PING_MS) { send(': ping\n\n'); pinged = Date.now(); }
        timer = setTimeout(tick, TICK_MS);
      };
      timer = setTimeout(tick, TICK_MS);
    },
    cancel() {
      closed = true;
      clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
