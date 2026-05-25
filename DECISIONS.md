# DECISIONS

Three architectural decisions worth defending in conversation. Each entry is the *reason* something is the way it is — not a description of what the code does.

---

## Decision 1 — `streamText` + `Output.object` + `experimental_useObject` over `streamUI`

**Choice.** Server uses `streamText({ output: Output.object({ schema: FormSpec }), ... })`, returning a typed JSON stream. Client uses `experimental_useObject({ api: '/api/intake', schema: FormSpec })` to receive `DeepPartial<FormSpec>` deltas. The renderer dispatches to a closed component registry on the client. The model never emits JSX or RSC. Partials are iterated server-side via `result.partialOutputStream`; the final value is read with `await result.output` (the `onFinish` event does not carry the parsed object).

**Alternative considered.** `streamUI` — let the model invoke server tools that return RSC trees, streaming React components straight to the client.

**Why this way.**

- **Inspectability.** The model output is a JSON object. We can write it to NDJSON, replay it, diff it, eval it with set operations. `streamUI` output is an RSC tree — opaque to logging and to scoring.
- **Eval feasibility.** The eval rubric (field-set Jaccard, critical-field hits) is trivial on `Set<string>` of field IDs. Comparing React trees that came out of `streamUI` would require a serializer we'd have to invent.
- **Safety boundary.** The closed component registry on the client means whatever the model samples, only registered components render. With `streamUI` the model returns components directly — every unreviewed component shape is a potential injection point.
- **Persistence.** The completed FormSpec is JSON. We can save it, ship it to a backend, or re-render it later without re-running the model.

**Cost we accept.** We have to write our own client-side renderer (no automatic component-tree streaming). Partial-render safety becomes our problem — see Decision 3 and the Phase 6 work.

---

## Decision 2 — Closed component registry over open-ended schema

**Choice.** `field.type` is a `z.enum(['text', 'number', 'radio', 'multiselect', 'slider', 'severity', 'date', 'checkbox'])`. Each registered component has a typed Zod schema for its props. If the model samples a `type` outside the enum, Zod fails the field and the renderer drops it.

**Alternative considered.** Open-ended schema: `type: z.string()` plus `props: z.record(z.unknown())`, and the renderer tries to render whatever shape arrives.

**Why this way.**

- **Production-grade pattern.** An open-ended schema turns the model into a source of UI security risks. Today it emits a checkbox; tomorrow's prompt drift might emit `type: 'iframe'` with a `src`. Closed registry makes that impossible by construction.
- **Auditability via NDJSON.** `cat logs/intake-streams/*.ndjson | jq '.spec.sections[].fields[].type' | sort | uniq -c` answers "what types is the model actually using" in one second. The set is finite and the histogram is meaningful.
- **Refactor safety.** Adding a 9th field type is a code review (component + schema entry + registry entry), not a prompt tweak. Each new type has typed props at the boundary.

**Cost we accept.** New rendering capability requires code, not just prompt edits. If the model wants something unregistered, it gets a refusal at the schema layer — we lose coverage. The eval harness exists partly to make those gaps visible (track which types the model tries to emit but the schema rejects).

---

## Decision 3 — Stable composite React keys (`${id}::${type}`) over id-only keys

**Choice.** Each rendered field uses `key={fieldKey(field)}` which produces `${field.id}::${field.type}`. When the model changes a field's `type` between deltas, the key changes, React unmounts the old component and mounts the new one cleanly.

**Alternative considered.** `key={field.id}`. React would try to reuse the same component instance across a type-flip, mixing props from incompatible components.

**Why this way.**

- **Single key = single component identity.** That's React's load-bearing invariant. A type-flip violates it; composite keys restore it.
- **Clean unmount on type-flip.** No prop merging, no zombie state in `react-hook-form` (which we use with `shouldUnregister: false` precisely because we *want* form state preserved across deltas — except across type-flips, where the old field's value would be meaningless to the new component).
- **Index keys are not an option.** Mid-stream, fields shift index as siblings appear, so indexing would unmount-remount everything every delta and `react-hook-form` would lose every keystroke the user typed.

**Cost we accept.** When the model type-flips a field, the user's input for that field is discarded. In practice type-flips occur in a small fraction of fields, almost always before the user has typed anything. The trade — lose a rare keystroke vs. cascade React warnings on every flip — is clearly worth it.
