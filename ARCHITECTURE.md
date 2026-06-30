# Architecture — Streaming Symptom Intake

> Technical decisions and rationale. The project's main architectural leitmotif is to **separate the model's decision from the UI render**: the model emits typed JSON, the client deterministically renders it from a closed component registry.

---

## Stack

| Layer | Technology | Version / comment |
|------|------------|----------------------|
| Framework | Next.js 16 App Router | React 19 RSC + Client Components |
| Language | TypeScript strict | discriminated union — types must be precise |
| Styling | Tailwind CSS + shadcn/ui | Form components — input, select, slider, radio-group, checkbox |
| AI SDK | Vercel AI SDK v6 | `ai` server side (`streamText` + `Output.object`, `gateway` provider), `@ai-sdk/react` client side |
| Schema validation | Zod 4 | discriminated union is the heart of the project |
| Primary model | Claude Haiku 4.5 | `gateway('anthropic/claude-haiku-4-5')` — small + fast wins for streaming feel, routed via Vercel AI Gateway |
| Comparison model | gpt-4o-mini | `gateway('openai/gpt-4o-mini')` — alternative for eval comparison, also via Gateway |
| Third model | Gemini 2.5 Flash | `gateway('google/gemini-2.5-flash')` — Gemini also routes through the gateway on the single `AI_GATEWAY_API_KEY` |
| State management | React 19 + react-hook-form | rhf for form state, useObject for streaming |
| Voice input (optional) | Browser SpeechRecognition API | free, no keys, no deps |
| Observability log | Local NDJSON file | append-only stream events |
| Deploy | Vercel free tier | env: `AI_GATEWAY_API_KEY` (required) — covers all providers, including Gemini |

**Deliberately not used:** Whisper (browser SpeechRecognition is enough), `streamUI` (see DECISIONS), server-side DB (the form is stateless), authentication.

---

## Data flow

```
                    User input (text / voice)
                              │
                              ▼
                  app/page.tsx (client component)
                              │
                  experimental_useObject({
                    api: '/api/intake',
                    schema: FormSpec
                  })
                              │
                              ▼
                  POST /api/intake (server route)
                              │
                  streamText({
                    model: gateway('anthropic/claude-haiku-4-5'),
                    output: Output.object({ schema: FormSpec }),
                    system: SYSTEM_PROMPT_V1,
                    prompt: complaint,
                  })
                              │
                              │ stream of partial objects
                              ▼
              Client receives DeepPartial<FormSpec> on each delta
                              │
                              ▼
                       FormRenderer (client)
                              │
                  for each section in formSpec.sections ?? []:
                    for each field in section.fields ?? []:
                      if isFieldRenderable(field):
                        registry[field.type](field.props)
                              │
                              ▼
                  React tree updates with stable keys
                              │
                              ▼
                  Form state preserved in react-hook-form
                  (because keys are stable per field.id)
```

---

## Repo structure

```
symptom-intake/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # main: complaint input + streamed form
│   ├── eval/page.tsx                # eval results dashboard
│   └── api/
│       └── intake/route.ts          # streamText + Output.object handler
│
├── schemas/
│   ├── v1/
│   │   ├── form-spec.ts             # FormSpec, Section, FieldDescriptor (discriminated union)
│   │   ├── fields.ts                # individual field type schemas
│   │   └── triage.ts                # TriageContext (suspectedCategory, redFlags)
│   └── v2/                          # appears when v1 evolves
│
├── fields/                          # the closed component registry
│   ├── registry.ts                  # FieldType → React component map
│   ├── TextField.tsx
│   ├── NumberField.tsx
│   ├── RadioField.tsx
│   ├── MultiselectField.tsx
│   ├── SliderField.tsx
│   ├── SeverityField.tsx
│   ├── DateField.tsx
│   ├── CheckboxField.tsx
│   └── __helpers__/
│       ├── is-renderable.ts         # type guard for partial fields
│       └── stable-key.ts            # field.id → React key
│
├── render/
│   ├── FormRenderer.tsx             # iterates sections + fields, dispatches to registry
│   ├── SectionHeader.tsx
│   └── RedFlagBanner.tsx
│
├── intake/
│   ├── prompt.ts                    # system prompt v1, exported with PROMPT_VERSION
│   ├── few-shot.ts                  # 3-4 example complaint→FormSpec pairs
│   └── stream.ts                    # streamText/Output.object wrapper for the route
│
├── voice/                           # optional, browser SpeechRecognition
│   ├── useSpeechRecognition.ts
│   └── VoiceButton.tsx
│
├── fixtures/
│   ├── complaints.json              # 20 hand-written test complaints
│   └── expected/                    # one .json per complaint with expected FormSpec shape
│       ├── chest-pain-female-55.json
│       └── ...
│
├── evals/
│   ├── harness.ts                   # `pnpm eval` runs all fixtures
│   ├── score.ts                     # Jaccard on field IDs + partial-render replay
│   ├── results.json                 # append-only history
│   └── README.md
│
├── logs/
│   └── intake-streams/              # NDJSON per session
│       └── {sessionId}.ndjson
│
├── DECISIONS.md
└── README.md
```

---

## Closed component registry pattern

The heart of the project. The model **never** emits JSX. It emits a field type ID + typed props.

```ts
// fields/registry.ts
import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { RadioField } from './RadioField';
// ... etc

export const FIELD_TYPES = [
  'text', 'number', 'radio', 'multiselect',
  'slider', 'severity', 'date', 'checkbox',
] as const;

export type FieldType = typeof FIELD_TYPES[number];

export const fieldRegistry: Record<FieldType, React.ComponentType<any>> = {
  text: TextField,
  number: NumberField,
  radio: RadioField,
  multiselect: MultiselectField,
  slider: SliderField,
  severity: SeverityField,
  date: DateField,
  checkbox: CheckboxField,
};
```

In the schema, `field.type` is `z.enum(FIELD_TYPES)`. If the model emits `type: "magic_widget"`, Zod validation fails and the field is ignored. **Closed.**

Benefits:
- **Safety.** The model cannot inject an arbitrary React component with hardcoded side-effects.
- **Auditability.** The system's behavior log is just JSON. `cat logs/intake-streams/*.ndjson | jq '.spec.sections[].fields[].type' | sort | uniq -c` — in 1 second you see the distribution of field types across requests.
- **Extensibility via PR, not via prompt.** Want a new field type — add a component + register it in the registry + extend the enum in the schema. Every new type goes through code review.

---

## FormSpec schema (discriminated union)

```ts
// schemas/v1/fields.ts
import { z } from 'zod';

const Base = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
  helpText: z.string().optional(),
});

export const TextFieldSchema = Base.extend({
  type: z.literal('text'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const NumberFieldSchema = Base.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  step: z.number().optional(),
});

export const RadioFieldSchema = Base.extend({
  type: z.literal('radio'),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(2),
});

export const MultiselectFieldSchema = Base.extend({
  type: z.literal('multiselect'),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(2),
});

export const SliderFieldSchema = Base.extend({
  type: z.literal('slider'),
  min: z.number(),
  max: z.number(),
  step: z.number().default(1),
});

export const SeverityFieldSchema = Base.extend({
  type: z.literal('severity'),
  // 0-10 pain scale; same shape as slider but different rendering
  scale: z.literal(10).default(10),
});

export const DateFieldSchema = Base.extend({
  type: z.literal('date'),
  // ...
});

export const CheckboxFieldSchema = Base.extend({
  type: z.literal('checkbox'),
});

export const FieldDescriptor = z.discriminatedUnion('type', [
  TextFieldSchema,
  NumberFieldSchema,
  RadioFieldSchema,
  MultiselectFieldSchema,
  SliderFieldSchema,
  SeverityFieldSchema,
  DateFieldSchema,
  CheckboxFieldSchema,
]);

export type FieldDescriptor = z.infer<typeof FieldDescriptor>;
```

```ts
// schemas/v1/form-spec.ts
import { z } from 'zod';
import { FieldDescriptor } from './fields';

export const SCHEMA_VERSION = 'v1.0.0' as const;

export const Section = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(FieldDescriptor),
});

export const TriageContext = z.object({
  suspectedCategory: z.string().optional(),
  urgency: z.enum(['routine', 'urgent', 'emergent']).optional(),
  redFlags: z.array(z.string()).default([]),
});

export const FormSpec = z.object({
  triageContext: TriageContext,
  sections: z.array(Section).min(1),
});

export type FormSpec = z.infer<typeof FormSpec>;
```

---

## Streaming partial-render safety

**This is the project's main exercise.** On every stream delta `useObject` returns `DeepPartial<FormSpec>`. That means:
- `formSpec.sections` may be `undefined` (model hasn't started yet)
- `formSpec.sections[0]` may be `{ id: 'vitals' }` with no title and no fields
- `formSpec.sections[0].fields[2]` may be `{ type: 'radio', label: 'Quality' }` with no `options` (the options array isn't there yet)
- `formSpec.sections[0].fields[2].type` may be `'text'` on the first delta and `'radio'` on the next (the model changed its mind)

### Rule 1: render-gate per field

Each field is checked for "is there enough data to safely render":

```ts
// fields/__helpers__/is-renderable.ts
import { FieldDescriptor } from '@/schemas/v1/fields';
import type { DeepPartial } from 'ai';

export function isFieldRenderable(
  partial: DeepPartial<FieldDescriptor> | undefined
): partial is FieldDescriptor {
  if (!partial?.id || !partial?.type || !partial?.label) return false;

  // Per-type minimum requirements
  switch (partial.type) {
    case 'radio':
    case 'multiselect':
      if (!Array.isArray(partial.options) || partial.options.length < 2) return false;
      if (partial.options.some((o) => !o?.value || !o?.label)) return false;
      return true;
    case 'slider':
      return typeof partial.min === 'number' && typeof partial.max === 'number';
    default:
      return true;
  }
}
```

In `FormRenderer.tsx`, fields that don't pass the gate **simply aren't rendered** on this delta. On the next delta, when the model adds the missing props, the field will appear.

### Rule 2: stable React keys

The model emits `field.id` early in the generation process. Use it as the `key` in React:

```tsx
{section.fields?.map((field, i) =>
  isFieldRenderable(field) ? (
    <FieldComponent key={field.id} field={field} />
  ) : null
)}
```

**Never use the array index.** If you do, react-hook-form will lose user input on every mid-stream delta.

### Rule 3: type-flip handling

If the model first emits `type: 'text'`, then changes to `type: 'radio'` — that's a component swap, and react-hook-form may receive nulls in unexpected places.

Solution: in `FormRenderer` use a composite key `${field.id}::${field.type}`. When the type changes the key changes, the old component unmounts cleanly, the new one mounts fresh.

```tsx
<FieldComponent key={`${field.id}::${field.type}`} field={field} />
```

The cost — loss of user input on a type-flip. But this is a **very rare** case (< 5% in evals) and users rarely manage to type anything before the flip.

### Rule 4: Zod safeParse on every delta

An alternative to the manual `isFieldRenderable` is running `FieldDescriptor.safeParse(partial)`:

```ts
const result = FieldDescriptor.safeParse(partial);
if (!result.success) return null; // skip this delta for this field
return <FieldComponent field={result.data} />;
```

**Advantage:** the schema is the single source of truth; no duplicated validation.
**Disadvantage:** Zod is more expensive, runs on every delta × every field.

**Recommendation:** start with `safeParse`, and if a profile shows it's slow, switch to the manual guard.

---

## Server route

```ts
// app/api/intake/route.ts
import { streamText, Output, gateway } from 'ai';
import { FormSpec } from '@/schemas/v1/form-spec';
import { intakeSystemPrompt, PROMPT_VERSION } from '@/intake/prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { complaint, model = 'haiku' } = await req.json();

  const llm =
    model === 'gpt-mini' ? gateway('openai/gpt-4o-mini')
    : model === 'gemini' ? gateway('google/gemini-2.5-flash')
    : gateway('anthropic/claude-haiku-4-5');

  const result = streamText({
    model: llm,
    output: Output.object({ schema: FormSpec }),
    system: intakeSystemPrompt,
    prompt: complaint,
    onFinish: async ({ usage }) => {
      // onFinish receives { usage, finishReason, ... } without the parsed
      // object — await result.output to get the final structured value.
      const output = await result.output;
      // log final to logs/intake-streams/{sessionId}.ndjson
      // (sessionId comes from a header or generated server-side)
    },
  });

  return result.toTextStreamResponse();
}
```

Notes:
- `streamText({ output: Output.object({ schema }) })` is the structured-streaming primitive.
- Iterate partials via `result.partialOutputStream`.
- Read the final value with `await result.output`. The `onFinish` callback only receives `{ usage, finishReason, ... }`, so awaiting `result.output` inside `onFinish` is the documented pattern.
- The `gateway` provider from `ai` routes Anthropic + OpenAI through the Vercel AI Gateway via a single `AI_GATEWAY_API_KEY`.

---

## Client (experimental_useObject)

```tsx
// app/page.tsx (client component)
'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { FormSpec } from '@/schemas/v1/form-spec';
import { FormRenderer } from '@/render/FormRenderer';

export default function Page() {
  const { object: spec, submit, isLoading, error } = useObject({
    api: '/api/intake',
    schema: FormSpec,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        {/* ComplaintInput component */}
        <ComplaintInput onSubmit={(complaint) => submit({ complaint })} />
      </div>
      <div>
        {error && <ErrorBanner error={error} />}
        {spec && <FormRenderer spec={spec} />}
        {isLoading && !spec && <Skeleton />}
      </div>
    </div>
  );
}
```

---

## Architectural decisions (for DECISIONS.md)

### Decision 1 — `streamText` + `Output.object` + `useObject` over `streamUI`

**Chosen.** `streamText({ output: Output.object({ schema }) })` on the server + `experimental_useObject` on the client. The model returns typed JSON. The UI renders from a closed component registry on the client.

**Alternative.** `streamUI` — the model returns an RSC tree (components) directly via `tool()` calls.

**Why.**
- **Inspectability.** Structured output is JSON. You can write logs as NDJSON, replay them, diff them, eval them. `streamUI` output is an RSC tree, opaque, not comparable.
- **Eval feasibility.** To assess a streamUI generation you have to compare React trees. With structured streaming — Jaccard on field IDs, trivial.
- **Persistence.** A form as JSON can be saved and re-rendered later without re-running the model.
- **Safety.** A closed component registry on the client gives a hard guarantee: whatever the model samples, only what's registered gets rendered.

**Cost.** You need a custom client-side renderer (no "magic" automatic component rendering like in streamUI). Partial-state safety becomes the client's responsibility.

### Decision 2 — Closed component registry with whitelisted types

**Chosen.** Field type is `z.enum(FIELD_TYPES)`. Each registered component has its own Zod schema for props. If the model emits a `type` outside the enum, Zod validation fails and the field is ignored.

**Alternative.** An open-ended schema where `type: z.string()` plus `props: z.record(z.unknown())`, and the client tries to render.

**Why.**
- **Production-grade pattern.** An open schema turns the model into a source of UI security risks.
- **Auditability.** The log of field types is a finite set. Metrics like "percentage of radio vs multiselect" read straight out of the NDJSON.
- **Refactor safety.** Want to add a new field type — that's a PR with a component, a schema extension, and a registry update. Every new type goes through code review, not prompt engineering.

**Cost.** Extension requires code, not just a prompt. If the model wants a component you haven't registered, it gets a refusal via Zod, and you get a coverage gap. The eval harness must check which types the model tries to emit most often so you can extend the registry in time.

### Decision 3 — Stable composite React keys (`${id}::${type}`)

**Chosen.** React `key` is `${field.id}::${field.type}`. On a type-flip the component fully remounts.

**Alternative.** `key` = `field.id`. Then on a type change React tries to reuse the same component — this causes a merge of props from different types and runtime warnings.

**Why.**
- React assumes that one key = one component. A type-flip violates that assumption and the tree drags around garbage.
- A composite key gives a clean unmount/mount.

**Cost.** On a type-flip user input for that field is lost. The eval harness shows that type-flips happen rarely (< 5%), and the loss is an acceptable price for stability in the rest of the cases.

---

## Eval rubric

Per-complaint scoring:

| Metric | What we measure | Formula |
|---------|-----------|---------|
| Field-set Jaccard | intersection of field IDs | `\|extracted ∩ expected\| / \|extracted ∪ expected\|` |
| Critical field hit | whether the _required_ fields for this complaint were present | binary, weighted ×2 |
| Section-set Jaccard | intersection of section IDs | like field-set, but over sections |
| Partial-render safety | _replay_ each delta through React, count `componentDidThrow` | binary "no throws" |
| Time-to-first-field | from submit to first renderable field | ms |

Aggregate per run: macro-mean per metric across all 20 fixtures.

`evals/results.json` — append-only:

```json
[
  {
    "runId": "2026-05-09T10:00:00Z",
    "schemaVersion": "v1.0.0",
    "promptVersion": "v1.0.0",
    "model": "claude-haiku-4-5",
    "perComplaint": [
      {
        "complaintId": "chest-pain-female-55",
        "fieldJaccard": 0.78,
        "criticalFieldHit": true,
        "sectionJaccard": 1.0,
        "partialRenderSafe": true,
        "timeToFirstFieldMs": 420
      }
    ],
    "aggregate": {
      "fieldJaccard": 0.74,
      "criticalFieldHit": 0.95,
      "sectionJaccard": 0.88,
      "partialRenderSafe": 1.0,
      "timeToFirstFieldP50Ms": 480,
      "timeToFirstFieldP95Ms": 720
    }
  }
]
```

---

## Observability

`logs/intake-streams/{sessionId}.ndjson` — one line per stream event:

```
{"event":"submit","ts":"2026-05-09T10:00:00.000Z","sessionId":"abc","complaint":"...","promptVersion":"v1.0.0","model":"claude-haiku-4-5"}
{"event":"delta","ts":"...","sessionId":"abc","deltaIdx":0,"partialSpec":{"triageContext":{}}}
{"event":"delta","ts":"...","sessionId":"abc","deltaIdx":1,"partialSpec":{"triageContext":{"suspectedCategory":"ACS"}}}
...
{"event":"first_field","ts":"...","sessionId":"abc","timeToFirstFieldMs":420}
{"event":"render_error","ts":"...","sessionId":"abc","fieldId":"pain_quality","error":"options array missing"}
{"event":"finish","ts":"...","sessionId":"abc","totalMs":1850,"finalSpec":{...},"tokensIn":312,"tokensOut":1240}
```

What a reviewer will see from these logs:
- **Latency profile.** P50/P95 time-to-first-field; P50/P95 total stream time.
- **Type-flip rate.** How many times `partialSpec.sections[i].fields[j].type` changed between deltas.
- **Render-error patterns.** Which fields fail the `isFieldRenderable` gate most often, and why (no options? no min/max?).
- **Stream shape.** Does the model emit "labels first, then types" or depth-first? This has a big impact on UX.

---

## What to show in the interview

1. **`fields/registry.ts` + `schemas/v1/fields.ts`** — "here's the closed set of components and their typed props; the model can't do anything outside this"
2. **`render/FormRenderer.tsx` + `fields/__helpers__/is-renderable.ts`** — "here are the four partial-render safety rules, each commented in DECISIONS.md"
3. **`evals/results.json`** — "here's partialRenderSafe: 1.0 across 20 complaints, and here are the time-to-first-field measurements"
4. **`logs/intake-streams/*.ndjson`** — "here's the stream as an event log; you can see when the model emits type, options, label"
5. **30-second video demo** — two complaints side-by-side, different forms

And only then — the actual demo in the browser.
