# Stage 5 — Closed component registry

The LLM generates JSON specifying `"type": "radio"`. The client itself decides which React component corresponds to that. Between the model and the React tree — a closed registry of exactly 8 components. This is neither an optimization nor a simplification. This is a **security boundary**.

---

## Why an open schema is a bad idea

The seductive alternative — let the model describe any component itself:

```ts
// BAD schema
const Field = z.object({
  type: z.string(),
  props: z.record(z.unknown()),
});
```

The client then does something like:

```tsx
const Cmp = window[field.type] ?? UnknownField;
return <Cmp {...field.props} />;
```

**What can go wrong:**

- Today the model returns `type: "checkbox"`. Tomorrow on prompt drift — `type: "iframe"` with `src: "https://evil.example.com"`. A closed registry stops this at the schema; an open one doesn't.
- The model returns `type: "image"` with `src: "javascript:..."`. The open registry doesn't know which props are safe and passes them through into the DOM.
- The model returns `props: { dangerouslySetInnerHTML: { __html: "<script>..." } }`. On some component this will fire.
- The model returns `type: "MyCheckbox"` (CamelCase), and in your code it's `MyCheckBox`. Quietly nothing renders — silent miss, doesn't appear in logs as an error.

An open schema turns the model into a source of UI injections. That's the equivalent of `eval(model_output)` for the frontend.

---

## Closed registry — three files

```
schemas/v1/fields.ts          ← FieldDescriptor: z.discriminatedUnion('type', [8 schemas])
fields/registry.ts            ← FIELD_TYPES ('text'|...|'checkbox') + fieldRegistry: Record<...>
fields/{Text,Number,...}Field.tsx  ← one component per type
```

`fields/registry.ts` in full:

```ts
import type { ComponentType } from 'react';
import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { RadioField } from './RadioField';
import { MultiselectField } from './MultiselectField';
import { SliderField } from './SliderField';
import { SeverityField } from './SeverityField';
import { DateField } from './DateField';
import { CheckboxField } from './CheckboxField';

export const FIELD_TYPES = [
  'text', 'number', 'radio', 'multiselect',
  'slider', 'severity', 'date', 'checkbox',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldRegistry: Record<FieldType, ComponentType<any>> = {
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

**What's not obvious here:**

- **`as const` on the array.** Without it `FIELD_TYPES` has type `string[]`, and `FieldType` would become `string`. With `as const` the Zod schema in `fields.ts` also knows the exact set of literals (if we wanted, we could pull `z.enum(FIELD_TYPES)`, but here the discriminated union is written out explicitly for readability).
- **`Record<FieldType, ...>`.** This is **required** coverage of all 8 types. If you add a 9th to `FIELD_TYPES` but forget it in `fieldRegistry` — TypeScript will flag it. It's inflexible — you can't skip registration.
- **`ComponentType<any>`.** Here `any` for props is deliberate — each component is typed by its own Zod inference (`TextField` expects `TextFieldType`, `RadioField` — `RadioFieldType`). Making a shared type would be either impossible (props for TextField and SliderField are different) or unwieldy via generics. At the level of `FormRenderer` the type narrows through the discriminated union — after `safeParse`, `safe.type === 'text'` implies `safe` is a `TextField`.

---

## How the registry interacts with the schema

In `render/FormRenderer.tsx`:

```tsx
const parsed = FieldDescriptor.safeParse(field);
if (!parsed.success) return null;
const safe = parsed.data;

const Cmp = fieldRegistry[safe.type as keyof typeof fieldRegistry];
if (!Cmp) return null;

return <Cmp field={safe} control={methods.control} />;
```

The chain of checks:

1. **Schema** says: `safe.type` is one of the 8 literals (`'text' | 'radio' | ...`).
2. **Registry** maps each literal to a React component.
3. **`if (!Cmp) return null`** — safety belt in case TS is fooled (for example, via `as any` somewhere).

If the schema and the registry are aligned, `!Cmp` never fires in prod. It's a runtime invariant you could even bake into a unit test:

```ts
// hypothetical invariant test
for (const t of FIELD_TYPES) {
  expect(fieldRegistry[t]).toBeDefined();
}
```

This project doesn't have such a test — the TypeScript check on `Record<FieldType, ...>` guarantees this statically. But in more complex codebases with dynamic registries (for example, a plugin system) add it.

---

## How to add a 9th type

Say you need `EmailField`. The steps:

1. **Schema.** Add to `schemas/v1/fields.ts`:
   ```ts
   export const EmailFieldSchema = Base.extend({
     type: z.literal('email'),
     placeholder: z.string().optional(),
   });
   ```
   Extend the discriminated union: `[..., EmailFieldSchema]`.

2. **Component.** Create `fields/EmailField.tsx`. Modeled on `TextField`, but with `type="email"` on `<Input>`.

3. **Registry.** In `fields/registry.ts` add `'email'` to `FIELD_TYPES` and `email: EmailField` to `fieldRegistry`. TypeScript will force you — without this `Record<FieldType, ...>` won't compile.

4. **Render-gate.** In `fields/__helpers__/is-renderable.ts` add `'email'` to the case with the base types (`text/number/severity/date/checkbox`).

5. **Prompt.** In `intake/prompt.ts` describe the new type in `fieldTypesDoc`. Without this the model won't use it.

6. **Schema version.** Bump `SCHEMA_VERSION` in `schemas/v1/form-spec.ts` to `v1.1.0` (minor, not breaking — adding a type is backward-compatible).

7. **Prompt version.** Bump `PROMPT_VERSION` to `v1.1.0`.

8. **Few-shot.** Add an example with an `email` field to `intake/few-shot.ts`.

9. **Test.** Add a case to `partial-render.test.ts`.

**Steps that are easy to skip (and what breaks then):**

- **Skipped step 5 (prompt):** the model doesn't know about the email type, doesn't sample it, the field never appears in the output. Silent miss. Eval metrics won't show it — because the expected fixtures don't have it either.
- **Skipped step 4 (render-gate):** for email fields `isFieldRenderable` returns `false` (default case), the field doesn't render, even though Zod is valid. Snapping error — the field appears in the logs as pre-filter dropped.
- **Skipped step 8 (few-shot):** the model sees the type in the prompt description, but doesn't understand when to use it. It will use it only for direct "email address?" questions, won't infer it for "contact" or "patient email".

This is a deliberate cost: **every new type goes through code review, not prompt engineering.** Want to add behavior quickly — change the prompt. Want it reliable — add a type.

---

## Closed vs the scaling problem

Closed registries are criticized for scaling — "if you have three product teams, each wants their own fields, the registry becomes a bottleneck".

This is solved through **federated registries**:

```ts
// fields/registry.ts
const coreRegistry: Record<CoreFieldType, ComponentType<any>> = { ... };
const medicalRegistry: Record<MedicalFieldType, ComponentType<any>> = { ... };
const adminRegistry: Record<AdminFieldType, ComponentType<any>> = { ... };

export const fieldRegistry = { ...coreRegistry, ...medicalRegistry, ...adminRegistry };
```

Each registry is a separate package with explicit versioning and a code-review boundary. The schema is also segmented (`MedicalFieldDescriptor = z.discriminatedUnion('type', [...])`). This scales to dozens of teams without losing safety.

**In this project we stay with one monolithic registry** — because 8 types, one team, one git repo. When you have 80 types and 8 teams — federate.

---

## Auditability — why this matters for production

`logs/intake-streams/*.ndjson` stores every partialSpec. A closed registry makes analytics trivial:

```bash
cat logs/intake-streams/*.ndjson \
  | jq -r 'select(.event=="finish") | .finalSpec.sections[].fields[].type' \
  | sort | uniq -c | sort -rn
```

In one command you get the distribution of field types across all sessions. Something like:

```
   312 number
   287 text
   198 radio
   156 checkbox
    87 severity
    54 multiselect
    23 slider
    12 date
```

Now you see: `slider` is used in 1.5% of cases. Is it worth a separate component? Maybe replace with `number` with min/max? That's a decision you can make based on data, not intuition.

With an open schema such a query is impossible — every type is arbitrary.

---

## What to show in an interview

1. `fields/registry.ts` — "here's the closed set, TypeScript forces coverage of all 8 types".
2. `schemas/v1/fields.ts` — "here's the discriminated union over the same 8 literals; schema and registry are in sync".
3. `render/FormRenderer.tsx` (the lookup lines) — "here's how the registry cooperates with safeParse".
4. NDJSON analytics through `jq` — "here in 1 second we see the type distribution in prod".
5. DECISIONS.md, Decision 2 — "here's why an open schema was rejected".

---

## Further reading

- [CopilotKit — Generative UI guide](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026) — overview of approaches: closed registry, pattern registry, open generation
- [Generative UI Guide (generativeui.ru)](https://generativeui.ru/en/learn/generative-ui-react-practical-guide) — overview of patterns, registry pattern
- [DECISIONS.md — Decision 2](../../02-streaming-symptom-intake/DECISIONS.md) — formal justification of the closed registry
- [React — type-narrowing with discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) — how TS narrows the type inside a switch on the discriminator
