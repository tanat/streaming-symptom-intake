import { promises as fs } from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.join(process.cwd(), 'logs', 'intake-streams');

function isWritableFs(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1';
}

export type IntakeLogEvent =
  | {
      event: 'submit';
      ts: string;
      sessionId: string;
      complaint: string;
      promptVersion: string;
      schemaVersion: string;
      model: string;
    }
  | {
      event: 'delta';
      ts: string;
      sessionId: string;
      deltaIdx: number;
      partialSpec: unknown;
    }
  | {
      event: 'first_field';
      ts: string;
      sessionId: string;
      timeToFirstFieldMs: number;
    }
  | {
      event: 'finish';
      ts: string;
      sessionId: string;
      totalMs: number;
      finalSpec: unknown;
      tokensIn?: number;
      tokensOut?: number;
    }
  | {
      event: 'render_error';
      ts: string;
      sessionId: string;
      fieldId?: string;
      error: string;
    };

export async function appendToSessionLog(
  sessionId: string,
  event: IntakeLogEvent,
): Promise<void> {
  if (!isWritableFs()) {
    // Production (Vercel) — log to stderr instead of FS.
    process.stderr.write(JSON.stringify(event) + '\n');
    return;
  }
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${sessionId}.ndjson`);
    await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(
      `[intake-log] failed to write session ${sessionId}: ${(err as Error).message}\n`,
    );
  }
}
