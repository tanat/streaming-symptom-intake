# Stage 1 — Mental model: streamText + Output.object + useObject vs streamUI

You're about to make an architectural choice that will define everything else in the project. Input — a user complains about symptoms. Output — a complaint-specific form that appears progressively. In between there has to be an LLM. The question: **what exactly does the LLM generate?**

You have three options. All three are working production patterns. But they're not interchangeable.

---

## Option A — streamUI: the model writes UI

`streamUI` (RSC tools in AI SDK v6) lets the model call a tool that returns a React Server Component. The model literally decides: "here's a RadioField, here's a SeverityField", and the server serializes the RSC tree, the client hydrates it.

```ts
// pseudo
streamUI({
  model,
  prompt: complaint,
  tools: {
    showRadioField: tool({ ..., generate: ({label, options}) => <RadioField .../> }),
    showSliderField: tool({ ..., generate: ({label, min, max}) => <SliderField .../> }),
  }
})
```

Looks magical. One call — components appear on the client. No client-side renderer to write.

**Why it's a bad idea for this project (and most production projects):**

- **Inspectability — zero.** What came out of the model? An RSC tree. That's not JSON. You won't put it into NDJSON, won't `jq` over field types, won't diff two runs.
- **Eval harness is impossible.** To score two forms you need to compare two React trees. You write the serializer yourself, and you write it correctly — also yourself. And you'll have to redo it on every component refactor.
- **Persistence — impossible.** The form isn't saved as data. You can't close it and reopen it later. To get this form again — call the model again and pay for tokens.
- **Security boundary — blurred.** The model decides which component to render and with which props. If tomorrow `props` contains `dangerouslySetInnerHTML` or `href: 'javascript:...'` — that's your problem, not the model's. A closed registry inside RSC tools helps partially, but you still trust the model to choose the hierarchy.

streamUI is for prototypes and demos. Not for systems that need an eval metric.

---

## Option B — generateText without structure: the model writes JSON into text

The laziest path: `generateText({ prompt: "here's a complaint, return form JSON" })`, then `JSON.parse(text)`.

```ts
const { text } = await generateText({ model, prompt: complaint });
const spec = JSON.parse(text); // any
```

**Failure mode, and why this option doesn't count:**

- The model sometimes wraps JSON in a markdown fence `\`\`\`json ... \`\`\``. Sometimes adds a preamble "Sure, here is the form:".
- `JSON.parse` will fail on a trailing comma, single quotes, an unclosed array.
- For every response you wait for full completion. No streaming. On a 1200-token form that's 2-3 seconds of black screen.
- Type `any`. TypeScript doesn't help you.

This option is only for one-off scripts.

---

## Option C — streamText + Output.object + experimental_useObject (our choice)

The model returns **strictly typed JSON** by schema. The server streams partial objects, the client assembles them into `DeepPartial<FormSpec>` and renders them from its closed component registry.

```ts
// app/api/intake/route.ts
import { streamText, Output, gateway } from 'ai';

const result = streamText({
  model: gateway('anthropic/claude-haiku-4-5'),
  output: Output.object({ schema: FormSpec }),   // Zod 4 schema
  system: intakeSystemPrompt,
  prompt: complaint,
  onFinish: async ({ usage }) => {
    // onFinish doesn't receive the parsed object —
    // pull the final object via await result.output.
    const output = await result.output;
    // log final state
  },
});
return result.toTextStreamResponse();
```

```tsx
// app/page.tsx
const { object: spec, submit, isLoading, error } = useObject({
  api: '/api/intake',
  schema: FormSpec,
});
// spec: DeepPartial<FormSpec> | undefined
```

**Why exactly this:**

- **Output is JSON.** Logging is trivial (`JSON.stringify(partial)` into NDJSON). Diff between two runs — diff of two JSONs. Eval — `Set<string>` intersections on field IDs. See `evals/score.ts`.
- **Persistence for free.** FormSpec is data. Save it to the DB, hand it to another client, re-render later without the model.
- **Closed registry on the client — a hard boundary.** Whatever the model generates, only what's registered in `fields/registry.ts` appears on screen. The model has no access to the React tree at all. See stage 5.
- **Schema = contract.** The same `FormSpec` is used both in `Output.object({ schema })` on the server (constrains output), in `useObject({ schema })` on the client (types `object`), in few-shot examples in the prompt, and in evals. One source of truth.
- **Streaming works naturally.** `useObject` writes `object` after every delta. The render-gate decides what to show. See stage 4.

**The price you pay:**

- You write the client renderer yourself (`render/FormRenderer.tsx`).
- Partial-render safety is your responsibility (stage 4).
- Every new field type needs a PR with a component + a schema branch + registration in the registry. That's not a bug, it's a feature: every new type goes through code review.

---

## What you'll see in the browser

Network → `POST /api/intake` → Response tab. Text arrives in chunks. This isn't "JSON character by character" — these are **partial JSON snapshots**. On every delta the AI SDK tries to extend the current buffer to a valid object (via json-repair or a similar parser) and emits the current best-effort `DeepPartial<FormSpec>`.

What this means for the UI:
- `spec` starts as `undefined`
- then `{ triageContext: {} }`
- then `{ triageContext: { urgency: 'urgent' } }`
- then `{ triageContext: {...}, sections: [{ id: 'vitals' }] }`
- then `{ ..., sections: [{ id: 'vitals', title: 'Vitals', fields: [{ id: 'bp_systolic', type: 'number' }] }] }`
- ...until finish arrives

On every snapshot React gets a new `object` from `useObject` and re-renders. React 19 concurrent rendering batches updates, but fundamentally every delta is a new `setState`. Your renderer must be pure: on any valid `DeepPartial<FormSpec>` it must not crash.

---

## Responsibility map

```
┌──────────────────────────────────────────────────────────────┐
│   LLM (claude-haiku-4-5)                                      │
│   Decides: FormSpec content — which sections, which fields    │
│   Doesn't decide: which React component renders, validity     │
└─────────────────────────┬────────────────────────────────────┘
                          │ stream of DeepPartial<FormSpec>
┌─────────────────────────▼────────────────────────────────────┐
│   AI SDK streamText + Output.object({ schema: FormSpec })     │
│   Guarantees: the final object matches the schema             │
│   Doesn't guarantee: every intermediate partial matches       │
└─────────────────────────┬────────────────────────────────────┘
                          │ DeepPartial<FormSpec>
┌─────────────────────────▼────────────────────────────────────┐
│   isFieldRenderable (render-gate)                             │
│   Decides: is there enough data to render safely              │
└─────────────────────────┬────────────────────────────────────┘
                          │ FieldDescriptor (full, not partial)
┌─────────────────────────▼────────────────────────────────────┐
│   Closed registry → React component                           │
│   Guarantees: only registered types render                    │
└──────────────────────────────────────────────────────────────┘
```

Each layer is a barrier. The model hallucinates `"type": "magic_widget"` → Zod rejects on the final parse, but `useObject` may already have let an intermediate state with that type pass through → `isFieldRenderable` returns `false` for unknown types → the registry returns `undefined` → `if (!Cmp) return null`.

**When it breaks if you remove one layer:**

- Remove `isFieldRenderable` → on a partial state of `radio` without `options` the renderer calls `.map()` on `undefined` → crash in `ErrorBoundary` in the middle of the form.
- Remove the closed registry, leave `type: z.string()` → the model returns `"type": "iframe"` with `src` → you render arbitrary URLs.
- Remove the Zod schema on the final parse → `onFinish` receives `object: unknown`, your log breaks on types, the DB gets garbage.

---

## What to choose in your project

- Need eval metrics, persistence, lifecycle (form lives on after the stream)? → **streamText + Output.object + useObject + closed registry**. This project.
- A 10-minute demo, no one will ever return to this form, no metrics needed? → streamUI is acceptable.
- One-off script, not UI? → `generateObject` without streaming, don't breed complexity.

---

## Practice

1. Open `app/api/intake/route.ts` — find `streamText({...})` with `output: Output.object({ schema: FormSpec })`. What's passed into `schema`? Who calls this on the client?
2. Open `app/page.tsx` — find `useObject({ api: '/api/intake', schema: FormSpec })`. Notice: schema is specified **twice** — on the server and on the client. Why? Because the client doesn't trust the server: `useObject` parses incoming text itself, against its own copy of the schema. This protects the client from schema drift across deploys.
3. Run `pnpm dev`, send a complaint. In Network → Response watch the JSON grow.

---

## Further reading

- [streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — `partialOutputStream`, `result.output`, `onFinish`, `providerOptions`
- [useObject reference](https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-object) — `object`, `submit`, `isLoading`, `error`
- [CopilotKit guide to Generative UI 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026) — overview of approaches and trade-offs
- [DECISIONS.md](../../02-streaming-symptom-intake/DECISIONS.md) — the three architectural decisions of this project, expanded
