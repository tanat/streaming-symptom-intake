import { appendToSessionLog, type IntakeLogEvent } from '@/intake/log';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return new Response('invalid body', { status: 400 });
  }

  const event = body as Partial<IntakeLogEvent> & { sessionId?: string };
  if (
    typeof event.sessionId !== 'string' ||
    !/^[a-f0-9-]{8,}$/i.test(event.sessionId)
  ) {
    return new Response('invalid sessionId', { status: 400 });
  }
  if (typeof event.event !== 'string') {
    return new Response('invalid event', { status: 400 });
  }

  await appendToSessionLog(event.sessionId, event as IntakeLogEvent);
  return new Response(null, { status: 204 });
}
