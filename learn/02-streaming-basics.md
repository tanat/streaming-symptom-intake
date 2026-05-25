# Stage 2 — Streaming basics: what streamText + Output.object actually streams

Streaming text is clear: the model writes a token, you show it right away. Streaming a structured object is a different matter. JSON has no meaning until the brackets are closed. What exactly `streamText({ output: Output.object({ schema }) })` emits, and how `useObject` decomposes it into `DeepPartial<FormSpec>` — that's the basic mechanics, and without it the following stages don't make sense.

---

## What streamText + Output.object does under the hood

The rough internal sequence:

1. **Constructs the prompt.** Takes your `system` + `prompt` + adds provider-specific instructions: for Anthropic — JSON schema via tool-use, for OpenAI — `response_format: { type: "json_schema", strict: true }`, for Google — `responseSchema` or a textual instruction (depends on the model).
2. **Streams tokens.** Receives an SSE/chunked token stream from the provider. On every chunk it appends to the buffer.
3. **Repairs the buffer up to valid JSON.** This is the key trick. If your buffer contains `{"sections":[{"id":"vitals","fields":[{"id":"bp","ty`, that's not valid JSON. The SDK plugs in the missing brackets/quotes — typically via a partial-json parser like `partial-json` or its own stack-walk. The result is "best-effort" JSON.
4. **Parses the repaired JSON.** Then validates through your Zod schema **in partial mode** — this isn't a full `safeParse`, but rather "does this match `DeepPartial<schema>`". Done via `schema.partial()` or equivalent.
5. **Emits the value to `partialOutputStream`.** Every time the buffer can be repaired and parsed, a new `DeepPartial<T>` is pushed into the `result.partialOutputStream` async iterator.
6. **On `finish`.** Gets the final text, parses it without partial mode through the **full** `schema.safeParse`. If it doesn't pass — throws an error. If it passes — the final parsed object is available as `await result.output`. The `onFinish({ usage, finishReason, ... })` callback **does not receive** `object` — if you need it inside, do `await result.output` right in `onFinish`.

What this means for you:
- `partialOutputStream` is not one-to-one with tokens. The SDK doesn't emit a partial on every token; only when the buffer can be parsed (typically — after closing each key or value).
- The final `await result.output` is **fully** validated. Intermediate partials are not.
- If the model returns garbage and the final parse fails — `await result.output` throws, `onFinish` is not called (or is called with error semantics, depending on how you subscribed to it).

---

## Server side: `app/api/intake/route.ts`

```ts
import { streamText, Output, gateway } from 'ai';

const result = streamText({
  model: llm,                              // gateway('anthropic/claude-haiku-4-5')
  output: Output.object({ schema: FormSpec }),  // Zod 4 schema via the output adapter
  system: intakeSystemPrompt,
  prompt: complaint,
  ...(modelKey === 'gpt-mini' && {
    providerOptions: { openai: { strictJsonSchema: false } },
  }),
  ...(modelKey === 'gemini' && {
    providerOptions: { google: { structuredOutputs: false } },
  }),
  onFinish: async ({ usage }) => {
    // onFinish doesn't hand over the parsed object —
    // pull the final object via await result.output.
    const output = await result.output;
    await appendToSessionLog(sessionId, {
      event: 'finish', ts: ..., sessionId,
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
```

What's not obvious here:

- **`output: Output.object({ schema })`** tells `streamText`: "instead of free text, assemble valid JSON per this schema and provide `partialOutputStream` + `result.output`".
- **`await result.output` inside `onFinish`** — the callback doesn't receive `object`. The final parsed object has to be pulled separately. `onFinish` has one shape for all kinds of output (text, object, whatever), and the output-type-specific result lives on `result.output`.
- **`providerOptions.openai.strictJsonSchema: false`** — `gpt-4o-mini` in strict mode often refuses to generate fields with `optional()` or `default()`. Turning strict off, you let it into a more forgiving mode, but in exchange you accept that it may return JSON that doesn't perfectly match the schema. The full `safeParse` on finish will still catch garbage.
- **`providerOptions.google.structuredOutputs: false`** — Gemini Flash 2.5 in structured mode limits length and breaks discriminated unions. Without structured mode the SDK falls back to text mode + json-repair. The price — sometimes a more ragged stream.
- **`toTextStreamResponse()`** — distributes JSON chunks as a `text/plain` stream. The `useObject` client parses this text and pulls partials. Don't confuse with `toDataStreamResponse()`, which wraps in AI SDK Chat's SSE format.
- **Gateway vs direct.** `gateway('anthropic/claude-haiku-4-5')` and `gateway('openai/gpt-4o-mini')` go via Vercel AI Gateway under one `AI_GATEWAY_API_KEY`. Gemini goes direct through `@ai-sdk/google` (`google('gemini-2.5-flash')`).
- **Custom header `x-intake-session-id`** — `onFinish` runs on the server, the client doesn't know under which sessionId the server is writing the log. Passing it via header is the easiest way. The client `useObject` doesn't read it; in this project the sessionId is generated on the client too, and they must match (see `submit({ ..., sessionId })`).

**When it breaks if you forget `await` in `onFinish`:** `onFinish` itself is async, and the SDK awaits it, but inside your callback `appendToSessionLog` is async — without await the file may not finish writing before the route completes in a serverless environment. On Vercel Functions you'll get dropped finish logs.

---

## Client side: `app/page.tsx`

```tsx
const { object: spec, submit, isLoading, error } = useObject({
  api: '/api/intake',
  schema: FormSpec,
});
```

`useObject` is a stateful hook:
- `object: DeepPartial<FormSpec> | undefined` — updates on every partial; after finish becomes the final object.
- `submit(body)` — POSTs to `api`. The body is serialized as JSON.
- `isLoading: boolean` — `true` from submit until finish/error.
- `error: Error | undefined` — set if the final parse fails or the stream is broken.

**Why the schema is passed to the client:** `useObject` parses the incoming text stream itself. On every delta it repairs to valid JSON, then validates against the schema you passed. If you don't pass a schema, you get an untyped `object: any` (or `unknown` — depending on the SDK's typings).

**Why the client and server use the same schema:** you import `FormSpec` from `schemas/v1/form-spec.ts` in both places. If tomorrow you evolve the schema and forget to rebuild the client — the client parses v1, the server sends v2, parse fails on the client. The fix: version the schema (`SCHEMA_VERSION = 'v1.0.0'`) and in prod put a schema-mismatch error in a visible place.

---

## What arrives on every delta

This project has observable proof — the `logs/intake-streams/{sessionId}.ndjson` log files. Run `pnpm dev`, send a complaint, open the file. Sample sequence (simplified):

```ndjson
{"event":"submit","sessionId":"abc","complaint":"chest pain","model":"claude-haiku-4-5"}
{"event":"delta","deltaIdx":0,"partialSpec":{"triageContext":{}}}
{"event":"delta","deltaIdx":1,"partialSpec":{"triageContext":{"suspectedCategory":"ACS"}}}
{"event":"delta","deltaIdx":2,"partialSpec":{"triageContext":{"suspectedCategory":"ACS","urgency":"emergent"}}}
{"event":"delta","deltaIdx":3,"partialSpec":{"triageContext":{...},"sections":[{"id":"vitals"}]}}
{"event":"delta","deltaIdx":4,"partialSpec":{"...":"...","sections":[{"id":"vitals","title":"Vitals","fields":[{"id":"bp_systolic","type":"number"}]}]}}
{"event":"first_field","timeToFirstFieldMs":480}
{"event":"delta","deltaIdx":5,...}
...
{"event":"finish","totalMs":1850,"finalSpec":{...}}
```

Note: the model writes **`triageContext` first**, then immediately starts the first section. There was no intermediate state of `{ triageContext: { ... } }` with empty `sections` — because the prompt arranged these keys in that order. **The key order in the schema (and in few-shot examples) determines what appears first.**

This matters for UX: if you want the user to see fields as early as possible, don't put a heavy `triageContext.redFlags` (array of strings) at the start. Put `sections` first to lower `time-to-first-field`. In this project we deliberately keep `triageContext` first — it's needed for RedFlagBanner, and time to first section is ~480ms anyway.

---

## Delta numbering and telemetry

The client in this project counts deltas and sends telemetry:

```tsx
// app/page.tsx — simplified extract
useEffect(() => {
  const sid = sessionIdRef.current;
  if (!sid || !spec) return;
  const idx = deltaIdxRef.current++;
  postLog({ event: 'delta', sessionId: sid, deltaIdx: idx, partialSpec: spec });

  if (!sawFirstFieldRef.current) {
    const renderable = (spec.sections ?? []).some((section) =>
      (section?.fields ?? []).some((f) => isFieldRenderable(f as any))
    );
    if (renderable) {
      sawFirstFieldRef.current = true;
      postLog({ event: 'first_field', sessionId: sid,
        timeToFirstFieldMs: Date.now() - submittedAtRef.current! });
    }
  }
}, [spec]);
```

What's not obvious here:

- **`useEffect([spec])` fires on every new `object` from `useObject`.** React 19 concurrent rendering may coalesce multiple setStates into one commit, but `useObject` guarantees that between two commits `spec` is a new object, not the same one. So the effect runs correctly.
- **`deltaIdxRef` via ref, not state.** Through state you'd get an extra re-render on increment. Through ref — you mutate and React doesn't know.
- **`sawFirstFieldRef` is also a ref.** It's a latch: once true — forever true for this session. Through state you'd re-render. Through ref — no.
- **`keepalive: true` in `postLog`.** A telemetry request must survive even if the user closes the tab. With `keepalive: true` the browser delivers the request to the server. Without it — the `Promise` is cancelled on unmount.

---

## When it breaks if you write `useEffect([])` for deltas

The temptation: "I'll put an effect without dependencies and pull values manually". Doesn't work. `useObject` doesn't expose a subscribe API, only `object` through state. If you don't react on `[spec]`, you miss every delta except the last (because effects on mount/unmount don't see intermediate values).

The correct pattern is the only one: `useEffect(..., [spec])` + ref-latches for one-shot events.

---

## About errors

The `error` from `useObject` can be:
- **schema-parse error** — the final text didn't pass `FormSpec.safeParse`. Most likely the model sampled an unknown `type` or junk JSON.
- **transport error** — the stream broke (network failure, user abort, 500 from the server before the stream started).
- **provider error** — the model refused to generate (rate limit, refusal, content policy).

In `app/page.tsx` we display them minimally:

```tsx
{error ? <p className="text-sm text-destructive">Stream error: {error.message}</p> : null}
```

In production add:
- log an `error` event into NDJSON,
- one retry (one!) on transport error via `submit(prevBody)`,
- distinct UI for schema-parse error ("the model couldn't handle this complaint, try rephrasing").

---

## Practice

1. Open DevTools → Network → POST `/api/intake`, the Response tab. See how the text grows in chunks? That's the `toTextStreamResponse` output.
2. Open `logs/intake-streams/*.ndjson` after a few runs. Count: how many deltas per session on average? How many ms to first_field?
3. Compare models: run the same complaint on `haiku`, then on `gpt-mini`. Compare the number of deltas and the time. Haiku is usually faster on time-to-first-field; gpt-mini can be faster on total time for short complaints.

---

## Further reading

- [streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — full API, the section on `output: Output.object(...)`, `partialOutputStream`, `result.output`
- [useObject reference](https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-object) — client hook
- [MDN — ReadableStream + chunked transfer](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) — the level at which HTTP streaming works under the hood
- [partial-json](https://github.com/promplate/partial-json-parser-js) — an example library for repairing incomplete JSON; conceptually similar to what happens inside the AI SDK
