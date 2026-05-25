# Stage 4 — Partial-render safety (the main exercise)

In demos streaming is shown as magic: data arrives — UI updates. No one explains what happens in between, while the `radio` field is already in the stream and its `options` aren't yet. That's where the crashes of production systems live — and in this project we work through, one by one, the four rules that make the renderer resilient to any intermediate `DeepPartial<FormSpec>`.

This stage is central. Without it nothing else works in prod.

---

## What partial-render even is

After every delta `useObject` writes into state a new `object: DeepPartial<FormSpec> | undefined`. React 19 (concurrent renderer by default) on every state change schedules a commit. On commit your `FormRenderer` iterates `spec.sections` and tries to render each field.

The problem: on some delta the array will contain this:

```json
{
  "sections": [{
    "id": "vitals",
    "title": "Vital Signs",
    "fields": [
      { "id": "bp_systolic", "type": "number", "label": "Systolic BP" },
      { "id": "pain_quality", "type": "radio" }
    ]
  }]
}
```

`pain_quality` is already in the array, `type` is already `"radio"`, **but there's no `options` yet**. If you naively render `<RadioField field={field} />` — `field.options.map(...)` will fail with `Cannot read properties of undefined`.

`ErrorBoundary` will catch it — but the user will see "Field pain_quality failed to render. Skipping." in the middle of the form, and on the next delta the component won't revive, because the error boundary stays in the error state until reset.

**Correct behavior:** on this delta the field `pain_quality` doesn't appear in the DOM at all. On the next delta, when the model adds `options`, the field appears. The user sees: the form fills in progressively, without visual glitches.

---

## Rule 1: Render-gate — don't render a field until it's ready

File: `fields/__helpers__/is-renderable.ts`.

```ts
export function isFieldRenderable(
  partial: DeepPartial<FieldDescriptor> | undefined | null,
): partial is FieldDescriptor {
  if (!partial) return false;
  if (typeof partial.id !== 'string' || partial.id.length === 0) return false;
  if (typeof partial.label !== 'string' || partial.label.length === 0) return false;
  if (typeof partial.type !== 'string') return false;

  switch (partial.type) {
    case 'radio':
    case 'multiselect': {
      const opts = partial.options;
      if (!Array.isArray(opts) || opts.length < 2) return false;
      for (const o of opts) {
        if (!o) return false;
        if (typeof o.value !== 'string' || o.value.length === 0) return false;
        if (typeof o.label !== 'string' || o.label.length === 0) return false;
      }
      return true;
    }
    case 'slider':
      return typeof partial.min === 'number' && typeof partial.max === 'number';
    case 'text': case 'number': case 'severity': case 'date': case 'checkbox':
      return true;
    default:
      return false; // unknown type — let Zod/registry reject
  }
}
```

**What's not obvious here:**

- **Type predicate `partial is FieldDescriptor`.** After `if (!isFieldRenderable(field)) return null` TypeScript knows: further on `field` is a full `FieldDescriptor`, not a `DeepPartial`. That removes the need for `?.` and `?? undefined` inside components. One guard — and the rest of the code is written as if the data were full.
- **Minimum per type.** `text` renders as soon as `id`, `type`, `label` are present — because `placeholder` and `maxLength` are optional. `radio` additionally needs a valid `options` array. `slider` needs `min` and `max`. This does not duplicate Zod — it's an **earlier** firing, coarser guard for the fast render-gate.
- **`for-of` over options instead of `.every`.** Purely for performance — `.every` creates a callback on every call, on a hot path that's an extra alloc.
- **`default: return false`.** If the model sampled `type: "magic_widget"`, the render-gate filters it out. Further on, Zod safeParse will also cut it off. But the render-gate is cheaper and fires first.

**When it breaks if you remove the render-gate:** on a partial state `radio` without `options`, `<RadioField />` crashes, the error boundary shows a placeholder, the field never revives.

**When it breaks if the render-gate is too strict** (for example, requires `required`): `required` is optional, the model doesn't always specify it, the field never renders → time-to-first-field grows to total stream time → streaming loses its point.

---

## Rule 2: Stable React keys — don't lose user input

Without stable keys:

```tsx
// BAD — array index as key
{section.fields?.map((field, i) =>
  isFieldRenderable(field) ? <FieldComponent key={i} field={field} /> : null
)}
```

What happens: on delta 5 the `bp_systolic` field passes the render-gate first and gets `key=0`. The user starts typing "120". On delta 7 the model inserts another field — `patient_age` — into the array before `bp_systolic`. Now `bp_systolic` is index 1, gets `key=1`. React sees "key=0 is now a different component" — does unmount+remount for both. `react-hook-form` loses the entered "120".

The solution in `fields/__helpers__/stable-key.ts`:

```ts
export function fieldKey(field: { id?: string; type?: string }): string {
  if (typeof field.id !== 'string' || field.id.length === 0) {
    throw new Error('fieldKey called on field without id');
  }
  if (typeof field.type !== 'string' || field.type.length === 0) {
    throw new Error('fieldKey called on field without type');
  }
  return `${field.id}::${field.type}`;
}
```

`field.id` arrives in the first delta for every field (because the prompt and few-shot put `id` first in the object). Using it as part of the key, we guarantee: React sees the same component between deltas, even when other props mutate.

**When it breaks if you use the index as the React key instead of a composite key:** user input is lost on every delta where a new field appears in front. On long forms this happens constantly — the stream almost always inserts fields in the order they emerge, and something is often added in front of already rendered fields. The user literally cannot type anything until the stream finishes.

---

## Rule 3: Composite key — correct type-flip

The model sometimes changes a field's `type` between deltas:

```
delta 4: { id: "pain_quality", type: "text",  label: "Quality" }
delta 5: { id: "pain_quality", type: "radio", label: "Quality", options: [...] }
```

This is rare (~3-5% of fields by eval data), but it happens. If the key is only `field.id` — React considers it the same component and tries to reuse `<TextField>` as `<RadioField>`. `react-hook-form` gets inconsistent state: for `id="pain_quality"` a text-input is registered, a radio-event arrives.

Composite key `${field.id}::${field.type}` solves it:

```
key: "pain_quality::text"  → unmount TextField
key: "pain_quality::radio" → mount RadioField (clean state)
```

**The price:** on a type-flip, the text entered by the user for this field is lost. In practice the type-flip happens early in the stream, before the user has had time to type anything. The trade-off is acceptable.

**An alternative we considered and rejected:** store input in shared `react-hook-form` state by `field.id` and feed it to the new component on mount. Doesn't work — a text value isn't valid for radio options. A clean unmount is cleaner.

---

## Rule 4: Belt-and-suspenders — Zod safeParse after the render-gate

`isFieldRenderable` is a hand-written guard. I wrote it, I can make a mistake. For example, you might forget to check that an element of `options` is an object, not a primitive:

```ts
// slightly incomplete guard
for (const o of opts) {
  if (!o) return false;
  if (typeof o.value !== 'string') return false; // ← but didn't check typeof o === 'object'
  // ...
}
```

And if the model returns `options: ["a", "b"]` (without objects), the guard will say "renderable" (because `'a'.value` is `undefined`, not a `string`, and we'll correctly return `false` — but that's accidentally correct).

That's why in `FormRenderer` there are **two** gates:

```tsx
// render/FormRenderer.tsx — simplified
{(section.fields ?? []).map((field) => {
  // Gate 1: fast manual check, type-predicate narrows the type
  if (!isFieldRenderable(field)) return null;

  // Gate 2: full Zod validation — the only source of truth
  const parsed = FieldDescriptor.safeParse(field);
  if (!parsed.success) return null;
  const safe = parsed.data;

  // Lookup in the closed registry
  const Cmp = fieldRegistry[safe.type as keyof typeof fieldRegistry];
  if (!Cmp) return null;

  // Composite key — type-flip gives clean unmount/mount
  const key = fieldKey(safe);

  return (
    <FieldErrorBoundary key={key} fieldId={safe.id}>
      <Cmp field={safe} control={methods.control} />
    </FieldErrorBoundary>
  );
})}
```

**Why two and not one:**
- Only Zod — more expensive on a partial stream. On ~30 fields × ~50 deltas = 1500 safeParse in one session. Zod 4 is fast, but still more expensive than a hand-rolled switch.
- Only a hand-written guard — risky. Any mistake in `isFieldRenderable` lets an invalid field into the component.
- Two layers — `isFieldRenderable` filters out ~95% of invalid cases cheaply, Zod catches the remaining 5% reliably.

**The invariant tested in `intake/__tests__/partial-render.test.ts`:**

> If `isFieldRenderable` returned `true`, then `FieldDescriptor.safeParse(field).success` must be `true`.

The test runs each field from few-shot through `partialSlices` (a generator of progressively fuller versions), and on every slice, if the guard said renderable, checks that Zod agrees. This is insurance against divergence between the two sources of truth.

---

## FieldErrorBoundary — the fifth barrier

Even after four guards a component can crash at runtime (for example, a bug in `react-hook-form` Controller). `FieldErrorBoundary` wraps every field:

```tsx
<FieldErrorBoundary key={key} fieldId={safe.id}>
  <Cmp field={safe} control={methods.control} />
</FieldErrorBoundary>
```

On a crash:
- Only this one field falls, not the whole form.
- In the UI — placeholder "Field {id} failed to render. Skipping.".
- Into the log you can send `event: 'render_error'` via the `onError` prop (see `render/ErrorBoundary.tsx`).

The composition of all five barriers in 12 lines of `FormRenderer`:

```
field → isFieldRenderable → safeParse → registry-lookup → composite-key → ErrorBoundary → mount
```

If a field fails any of the first four — `return null`, the field doesn't appear on this delta, wait for the next.

---

## Why `?.` everywhere is the wrong solution

The temptation is to replace the guard with optional chaining:

```tsx
function RadioField({ field }) {
  return (
    <RadioGroup>
      {field.options?.map(opt => (
        <RadioGroupItem key={opt?.value ?? ''} value={opt?.value ?? ''} label={opt?.label ?? ''} />
      ))}
    </RadioGroup>
  );
}
```

No crash. But the UI renders a **broken field** — a radio group without options. The user sees an empty element, thinks "the field is there, but I can't answer it". The form visually looks ready, but it's a trap.

**Correct approach:** the field is either present and ready for interaction, or it's not in the DOM. The appearance of a field is a UX event that happens exactly once, when it's really ready. An empty radio group is worse than a missing one.

---

## Practice: what you'll see in the tests

`intake/__tests__/partial-render.test.ts` — two main tests:

```ts
it('every fully-formed field passes both guards', () => {
  for (const ex of fewShotExamples) {
    for (const section of ex.formSpec.sections) {
      for (const field of section.fields) {
        expect(isFieldRenderable(field)).toBe(true);
        expect(FieldDescriptor.safeParse(field).success).toBe(true);
      }
    }
  }
});

it('progressive slices never sneak past guards into invalid props', () => {
  for (const ex of fewShotExamples) {
    for (const section of ex.formSpec.sections) {
      for (const field of section.fields) {
        for (const slice of partialSlices(field)) {
          if (!isFieldRenderable(slice as any)) continue;
          // If the guard said ok — Zod must agree.
          expect(FieldDescriptor.safeParse(slice).success).toBe(true);
        }
      }
    }
  }
});
```

Run `pnpm test partial-render`. Should be green.

Now do an experiment:

1. In `isFieldRenderable` remove the `partial.options.length < 2` check (or replace with `< 1`).
2. Run the test again.
3. The progressive-slices test will fail — because the guard now says "renderable" on a radio with one option, and Zod says "no, ≥2 required".

That's the invariant: the guard can only be **stricter** than Zod, never looser.

---

## React 19 concurrent rendering

React 19 (concurrent renderer by default):

- Every `useObject` update creates a new render, but React batches. You may not see an intermediate delta in the DOM if the next one arrived within 16ms.
- `useDeferredValue(spec)` could give extra control, but **isn't needed here** — rendering `FormRenderer` is fast on its own, and each field is already isolated by the guard.
- `startTransition` isn't needed either — you have no heavy re-renders; rendering 30 fields takes <16ms even on a mid-range mobile.

What **could** be useful:
- `<Suspense>` around heavy fields (for example, a MapField that lazy-imports Leaflet) — but there are none in this project.
- `useTransition` on submit — so the "Generate" button doesn't block while React does the first commit with a partial. In practice the stream starts within ~300ms, and this issue isn't visible.

---

## What to show in an interview

1. `fields/__helpers__/is-renderable.ts` — "here's the render-gate, type-predicate, minimum per type, all in one file".
2. `fields/__helpers__/stable-key.ts` — "composite key `id::type`, type-flip gives clean unmount/mount".
3. `render/FormRenderer.tsx` — "here are four gates in 12 lines; the fifth is ErrorBoundary around each field".
4. `intake/__tests__/partial-render.test.ts` — "the invariant: if the guard said renderable, Zod must agree. On every slice of every few-shot field — no divergence".
5. `evals/results.json` → `partialRenderSafe: 1.0` on 20 complaints — "that's the proof that in prod no field slipped past the guards".

---

## Further reading

- [useObject reference — DeepPartial](https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-object) — how `object` updates on every delta
- [Zod 4 — safeParse vs parse](https://zod.dev) — when to use which, performance notes
- [React 19 — concurrent rendering](https://medium.com/@tejutanvi773/concurrent-rendering-in-react-19-still-the-heart-of-reacts-performance-magic-832445d5e419) — what the concurrent renderer does with your setStates
- [React Lanes deep dive](https://dev.to/playfulprogramming/react-lanes-the-internal-engine-powering-modern-concurrent-rendering-1o5c) — how React 19 prioritizes updates
- [TypeScript Utility Types — DeepPartial pattern](https://www.typescriptlang.org/docs/handbook/utility-types.html) — how `DeepPartial<T>` is recursively built
