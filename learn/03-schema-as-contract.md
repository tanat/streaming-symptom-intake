# Stage 3 — Schema as contract: Zod 4 discriminated union

The schema in this project is not just a "type check". It's a **contract** between four independent parts of the system: the AI SDK via `Output.object({ schema })` on the server (constrains output), `useObject({ schema })` on the client (types client state), the system prompt (describes the same types in text), and the eval harness (checks the final shape). One file — four consumers. If that file isn't right, everything falls apart.

---

## Why a schema, not TypeScript types

TypeScript disappears at runtime. When the model returns JSON with the string `"type": "magic_widget"`, your `as FormSpec` cast won't stop anything — types are fine, at runtime `fieldRegistry['magic_widget']` is `undefined`, and from there as luck would have it.

Zod gives runtime validation. The AI SDK takes your Zod schema, turns it into JSON Schema, puts it into the provider call (Anthropic — via tool-use, OpenAI — via `response_format`, Google — via `responseSchema`). The provider tries to sample tokens such that valid JSON comes out. Then Zod on the finish still checks it — because the provider can't be fully trusted.

Zod 4 is fast on discriminated union: on the first discriminator (`type`) match, Zod skips all other branches. On 8 field types that's a ×8 difference in the worst case.

---

## Files

```
schemas/v1/triage.ts       ← TriageContext (urgency, redFlags)
schemas/v1/fields.ts       ← 8 field types + FieldDescriptor (discriminated union)
schemas/v1/form-spec.ts    ← FormSpec = { triageContext, sections[] }
```

Versioning is deliberate. `v1` lives until a breaking change appears (for example, you add a field that can't be made optional). `v2` is a separate folder so that old logs can be re-validated against the right version of the schema.

---

## FieldDescriptor: discriminated union over 8 types

```ts
// schemas/v1/fields.ts
import { z } from 'zod';

const Base = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
});

export const TextFieldSchema = Base.extend({
  type: z.literal('text'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const RadioFieldSchema = Base.extend({
  type: z.literal('radio'),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(2),
});

// ... 6 more types: number, multiselect, slider, severity, date, checkbox

export const FieldDescriptor = z.discriminatedUnion('type', [
  TextFieldSchema, NumberFieldSchema, RadioFieldSchema,
  MultiselectFieldSchema, SliderFieldSchema, SeverityFieldSchema,
  DateFieldSchema, CheckboxFieldSchema,
]);

export type FieldDescriptor = z.infer<typeof FieldDescriptor>;
```

**What's not obvious here:**

- **`z.discriminatedUnion('type', [...])`** is a special Zod construct that uses the `type` field as the key. On input `{ type: 'radio', ... }` Zod validates **only** against `RadioFieldSchema`, not trying the other 7 branches. A plain `z.union([...])` would try all branches, collect 8 errors and pick the best.
- **`z.literal('text')` as discriminator.** This is not `z.string()` — it's **strictly** the string `'text'`. If the model returns `'Text'` (capitalized) — fail.
- **`z.array(...).min(2)` for `options` on `radio`.** Radio with one option is meaningless. This check goes into JSON Schema → goes into the provider → the model learns not to sample single-element arrays. (In practice it still misses sometimes, which is why `isFieldRenderable` also checks this — see stage 4.)
- **`required: z.boolean().optional()`** — not `default(false)`. Defaults on a partial stream may behave unstably: the AI SDK on `schema.partial()` sometimes keeps `default`, sometimes not. Safer — `optional()` and explicit handling of `undefined` in the component.

**When it breaks if you use a regular union instead of discriminatedUnion:**

```ts
// BAD:
const Field = z.union([TextFieldSchema, RadioFieldSchema, ...]);
```

On every `safeParse` Zod tries all 8 branches. On a stream with ~30 fields × ~50 deltas = ~12000 validations in one session. With discriminated — 1500. On local dev you won't see the difference. On prod at 100 RPS — noticeable.

Plus — the union validation error contains **all 8** sub-errors. In discriminated — only one, from the matched `type` branch. Logs read more simply.

---

## Why versioning inside the file

```ts
// schemas/v1/form-spec.ts
export const SCHEMA_VERSION = 'v1.0.0' as const;

export const FormSpec = z.object({
  triageContext: TriageContext,
  sections: z.array(Section).min(1),
});
```

`SCHEMA_VERSION` is written into every NDJSON log:

```ts
await appendToSessionLog(sessionId, {
  event: 'submit', ..., schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION,
});
```

Why: in six months you'll come back to the logs, see a strange form, want to re-validate it. Without `schemaVersion` you don't know which schema was in prod at the time of the session. With a version — `import { FormSpec } from '@/schemas/v1/form-spec'` and parse v1 logs, and parse v2 logs with v2 schema.

Semver on the schema is the norm in AI projects. minor — adding an optional field; major — any breaking change in shape. Patch — usually not needed separately, ships together with the prod prompt.

---

## Where the schema is used

```
┌────────────────────────────────────────────────────────────────┐
│  schemas/v1/form-spec.ts (FormSpec)                             │
│  ↑                                                              │
│  │ — imported into —                                            │
│  │                                                              │
├──┴── app/api/intake/route.ts ─── streamText({ output: Output.object({ schema }) })
├──── app/page.tsx ──────────────── useObject({ schema })         │
├──── render/FormRenderer.tsx ──── FormSpec type, FieldDescriptor │
├──── fields/__helpers__/is-renderable.ts ── DeepPartial<Field>   │
├──── intake/prompt.ts ──────────── PROMPT_VERSION + text          │
│                                    description of the same 8 types │
└──── evals/harness.ts ──────────── FieldDescriptor.safeParse     │
```

If you add a 9th field type — `EmailField`, for example — you need to:

1. Add `EmailFieldSchema` to `schemas/v1/fields.ts` (or to `v2/`, if it's a breaking step).
2. Add to `FieldDescriptor` discriminated union.
3. Create `fields/EmailField.tsx`.
4. Register in `fields/registry.ts` (extend `FIELD_TYPES`).
5. Extend `isFieldRenderable` for the new type.
6. Describe the type in `intake/prompt.ts` — text documentation for the model.
7. Bump `SCHEMA_VERSION` (minor: `v1.1.0`).
8. Add a fixture in `fixtures/expected/` with this type.

**When it breaks if you forget step 4 (registry):** the schema lets the field through, isFieldRenderable lets it through, but `fieldRegistry[safe.type]` returns `undefined`, and the field doesn't render. The test `partial-render.test.ts` won't catch it — it exercises `isFieldRenderable`, not `FormRenderer`. The fix: add a runtime invariant `FIELD_TYPES === keys of fieldRegistry`. This project doesn't have such an invariant (deliberately simple code), but in prod it's worth adding.

**When it breaks if you forget step 6 (prompt):** the schema allows it, the registry renders it, but the model never samples the `email` type because the prompt doesn't know about it. The eval metric stays the same, the form doesn't improve. This is the sneakiest case — silent miss.

---

## DeepPartial: what Zod actually validates during the stream

`useObject` emits `DeepPartial<FormSpec>`. That means **all keys at all levels** are optional:

```ts
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;
```

At runtime: on every partial the AI SDK does roughly `z.object(...).deepPartial().safeParse(json)`. On input `{ sections: [{ id: 'vitals' }] }` this is valid (no `title`, no `fields`), but the final `FormSpec.safeParse({ sections: [{ id: 'vitals' }] })` will fail — `title` and `fields` are required.

From this follows **the main schema guideline for streaming**:

> The discriminator (`type`) and identifiers (`id`) must arrive **first**, before the model emits the other fields.

In our schema this is the case: the model learns this from few-shot examples, where in every field object `id` and `type` come before `label`, `options`, etc. If the model sampled `label` first, the render-gate would trigger later — later first_field, worse UX.

---

## When it breaks on edge cases

- **Model returns `type: "input"` (synonym of `text`).** Discriminated union rejects: `'input'` is not in the literal list. On the final parse — error, `onFinish` is not called. The fix — extend the prompt with an explicit ban on synonyms, or allow and normalize in `.transform()`.
- **`options` arrived, but one of the elements is `null`.** On finish Zod will say "expected object at sections[0].fields[2].options[1]". This is a rare partial-fix artifact. Usually by finish the model itself has corrected it.
- **`sections` an empty array.** The schema requires `min(1)`. The final parse fails. In practice this almost never happens — the prompt explicitly requires "at least one section".
- **The model writes JSON with trailing comments `// note: ...`.** The AI SDK doesn't parse JSON5. The final parse fails. This happens with Gemini in text mode more often than with Anthropic.

In each of these cases the final stream error is visible in `useObject.error`. The log records `event: 'render_error'` (or you can add `event: 'parse_error'`). This is your observability — the next stage.

---

## Practice

1. Open `schemas/v1/fields.ts`. For each of the 8 types — what's the minimum set of fields Zod needs to consider an object valid? Compare this with `isFieldRenderable`. Where do they diverge? Why?
2. In Node REPL: `FieldDescriptor.safeParse({ id: 'x', type: 'radio', label: 'Q', options: [{value:'a',label:'A'}] })`. Will return `success: false`. Why? Hint: `.min(2)`.
3. Run the tests: `pnpm test partial-render`. Open `intake/__tests__/partial-render.test.ts` — `partialSlices` generates "incomplete" versions of each field from few-shot and runs them through the guards.

---

## Further reading

- [Zod 4 docs](https://zod.dev) — discriminatedUnion, safeParse, z.infer
- [Zod 4 — Discriminated unions](https://zod.dev/?id=discriminated-unions) — performance details
- [OpenAI Structured Outputs vs Zod](https://dev.to/whoffagents/openai-structured-outputs-vs-zod-which-to-use-for-llm-response-validation-in-2026-366m) — when to use which
- [AI SDK — schema integration](https://sdk.vercel.ai/docs/foundations/structured-data) — how the AI SDK turns Zod into JSON Schema for each provider
