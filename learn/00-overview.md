# Learning Map — Streaming Symptom Intake

This project is a training ground for moving from fullstack into AI product engineering. Stack: Vercel AI SDK v6, Zod 4, React 19, Next.js 16, Claude Haiku 4.5 via Vercel AI Gateway. Each stage isolates one production pattern that tutorials don't explain.

---

## Why you're even reading this

The AI SDK tutorial shows you this:

```ts
const { text } = await generateText({ model, prompt });
```

And that's it. From there you figure out on your own what to do when the model returns structured JSON in pieces instead of `text`, when the `radio` field is already in the stream but its `options` haven't arrived yet, and React already wants to render it. From there you figure out on your own how to prove that the model didn't degrade after a prompt change. From there you figure out on your own how to stop the model from rendering arbitrary JSX.

This project is about those "from theres". Five tasks that show up in every production AI project:

- **Streaming structured JSON.** `streamText({ output: Output.object({ schema }) })` returns not a blob but a stream of `DeepPartial<FormSpec>`. On every delta the JSON is incomplete. Partials are iterated through `result.partialOutputStream`, the final object is fetched via `await result.output`.
- **Partial-render safety.** Every delta may contain a field without required props. The UI must not crash — and must not render empty widgets.
- **Closed component registry.** The model returns the string `"radio"`, the client renders its own `RadioField`. The model has no direct access to the React tree. This is a security boundary.
- **Observability.** NDJSON session log: `submit → delta × N → first_field → finish`. Without this you won't debug degradation.
- **Evals.** Numbers instead of feelings: Jaccard on field IDs, critical-field hit rate, time-to-first-field p50/p95.

---

## Map of stages

| # | File | What's covered | Difficulty |
|---|------|----------------|------------|
| 1 | `01-mental-model.md` | `streamText` + `Output.object` + useObject vs streamUI — why we chose JSON | Medium |
| 2 | `02-streaming-basics.md` | How `streamText` + `Output.object` emits partial chunks, how `useObject` assembles them | Medium |
| 3 | `03-schema-as-contract.md` | Zod 4 discriminated union as the AI ↔ UI contract | Medium |
| 4 | `04-partial-render.md` | **The main exercise** — four rules of partial-render safety | High |
| 5 | `05-closed-registry.md` | Closed registry vs open `props: z.record(z.unknown())` | Medium |
| 6 | `06-observability.md` | NDJSON event log, what you can do with this log afterward | Medium |
| 7 | `07-evals.md` | Jaccard, critical hit, partialRenderSafe — and why LLM-judge isn't needed here | High |
| 8 | `08-prompt-engineering.md` | System prompt as an engineering artifact with a version and few-shot | High |

---

## How to read this

Linearly. Each stage builds on the previous one. If you're short on time — stage 4 (partial-render) is the centerpiece, don't skip it. The others you can skim.

Open the code files alongside the text. These files are the source of truth:

```
schemas/v1/fields.ts          ← 8 field types, Zod 4 discriminated union
schemas/v1/form-spec.ts       ← FormSpec = { triageContext, sections[] }
schemas/v1/triage.ts          ← TriageContext (urgency, redFlags)
app/api/intake/route.ts       ← streamText + Output.object on the server + onFinish (await result.output)
app/page.tsx                  ← experimental_useObject on the client + telemetry
render/FormRenderer.tsx       ← renders DeepPartial<FormSpec>
fields/__helpers__/is-renderable.ts  ← render-gate (the main function)
fields/__helpers__/stable-key.ts     ← composite key id::type
fields/registry.ts            ← closed component registry
intake/prompt.ts              ← system prompt v1.0.0
intake/few-shot.ts            ← 3 examples of complaint→FormSpec
intake/log.ts                 ← appendToSessionLog → NDJSON
evals/harness.ts              ← pnpm eval — run fixtures through streamText + Output.object
evals/score.ts                ← jaccard + criticalFieldHit + partialRenderSafe
```

---

## What to do right now

1. `pnpm dev`
2. Open DevTools → Network → POST `/api/intake`
3. Type into the form "55-year-old female, chest pressure radiating to jaw"
4. The **Response** tab will show how the JSON is assembled in pieces — that's `DeepPartial<FormSpec>` in action
5. Open `logs/intake-streams/{sessionId}.ndjson` — there's the event log of this session: submit, delta×N, first_field, finish

If it feels like the text on the right is changing randomly — yes, that's how it is. The model doesn't write JSON left-to-right as whole objects. It writes tokens. Sometimes a token closes an array, sometimes it opens a new field. The stream is a series of snapshots of the state "here's what I've written so far".

---

## What's important to know about the stack

- **AI SDK v6.** Structured streaming — `streamText({ output: Output.object({ schema }) })`. Partials are iterated through `result.partialOutputStream`, the final object — `await result.output`. The `onFinish` callback doesn't receive a parsed `object` — inside `onFinish` we do the same `await result.output` for final logging.
- **Vercel AI Gateway.** Anthropic and OpenAI go through `gateway('anthropic/claude-haiku-4-5')` / `gateway('openai/gpt-4o-mini')` — one key `AI_GATEWAY_API_KEY`. Google stayed direct through `@ai-sdk/google` (`google('gemini-2.5-flash')`).
- **`experimental_useObject`** is still flagged `experimental_` — the API is stable by signature (`{ object, submit, isLoading, error }`), but the prefix hints: expect a rename.
- **Zod 4** — discriminated union is faster (skip-branch by the discriminator), supports unions/pipes inside branches. On a `DeepPartial` stream, Zod only validates what's there.
- **React 19** — concurrent rendering by default. Every stream delta triggers `setState`, React itself decides when to commit the render. Stable keys and the render-gate are what make the behavior deterministic.

---

## Further reading

- [streamText + Output.object reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — the API you see in `route.ts` (the `output: Output.object(...)` section)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) — one key instead of three
- [useObject hook](https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-object) — client hook, `DeepPartial<T>` on every delta
- [Zod 4 docs](https://zod.dev) — `z.discriminatedUnion`, `safeParse`, `z.infer`
