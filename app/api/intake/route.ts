import { streamText, Output, gateway } from 'ai';
import { FormSpec, SCHEMA_VERSION } from '@/schemas/v1/form-spec';
import { intakeSystemPrompt, PROMPT_VERSION } from '@/intake/prompt';
import { appendToSessionLog } from '@/intake/log';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RequestBody = {
  complaint: string;
  model?: 'haiku' | 'gpt-mini' | 'gemini';
  sessionId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody;
  const complaint = (body.complaint ?? '').trim();
  if (!complaint) {
    return new Response(
      JSON.stringify({ error: 'complaint is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const modelKey =
    body.model === 'gpt-mini' ? 'gpt-mini'
    : body.model === 'gemini' ? 'gemini'
    : 'haiku';
  const modelId =
    modelKey === 'gpt-mini' ? 'gpt-4o-mini'
    : modelKey === 'gemini' ? 'gemini-2.5-flash'
    : 'claude-haiku-4-5';
  const llm =
    modelKey === 'gpt-mini' ? gateway('openai/gpt-4o-mini')
    : modelKey === 'gemini' ? gateway('google/gemini-2.5-flash')
    : gateway('anthropic/claude-haiku-4-5');

  const sessionId =
    body.sessionId && /^[a-f0-9-]{8,}$/i.test(body.sessionId)
      ? body.sessionId
      : crypto.randomUUID();
  const startedAt = Date.now();

  await appendToSessionLog(sessionId, {
    event: 'submit',
    ts: new Date().toISOString(),
    sessionId,
    complaint,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    model: modelId,
  });

  const result = streamText({
    model: llm,
    output: Output.object({ schema: FormSpec }),
    system: intakeSystemPrompt,
    prompt: complaint,
    ...(modelKey === 'gpt-mini' && {
      providerOptions: { openai: { strictJsonSchema: false } },
    }),
    onFinish: async ({ usage }) => {
      // streamText's onFinish event no longer carries the parsed output;
      // await result.output to get the final structured value.
      const output = await result.output;
      await appendToSessionLog(sessionId, {
        event: 'finish',
        ts: new Date().toISOString(),
        sessionId,
        totalMs: Date.now() - startedAt,
        finalSpec: output,
        tokensIn: usage?.inputTokens,
        tokensOut: usage?.outputTokens,
      });
    },
  });

  const response = result.toTextStreamResponse();
  response.headers.set('x-intake-session-id', sessionId);
  return response;
}
