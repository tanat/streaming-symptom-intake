# Stage 8 — Prompt engineering as an engineering artifact

A prompt is **code**. It has a version, code review, tests (evals), changelog. The same engineering principles apply to it as to the rest of the code: explicit contracts, defensive coding, structured testing. If you treat the prompt as a "magic string I tweak by feel" — your project won't scale.

In this project the prompt lives in `intake/prompt.ts` + few-shot in `intake/few-shot.ts`.

---

## Structure of intake/prompt.ts

```ts
export const PROMPT_VERSION = 'v1.0.0' as const;

const fieldTypesDoc = `...`;          // what the 8 available field types are
const outputDiscipline = `...`;       // output format rules
const domainGuidance = `...`;         // domain-specific knowledge

export const intakeSystemPrompt = [
  'You are a triage-form generator...',
  'Given a chief complaint, you produce a typed FormSpec...',
  fieldTypesDoc.trim(),
  outputDiscipline.trim(),
  domainGuidance.trim(),
  'Few-shot examples...',
  fewShotExamples.map((ex, i) => renderExample(i, ex)).join('\n\n'),
  'Now generate the FormSpec for the user-provided complaint. Output JSON only.',
].join('\n\n');
```

**What's not obvious here:**

- **`PROMPT_VERSION = 'v1.0.0' as const`.** Written into every submit event in the log. This lets you retrospectively say "this session ran on prompt v1.0.0, and this one — on v1.1.0". Without a version — the log is useless after the first change.
- **The prompt is assembled from parts.** Not one big string, but an array `[role, task, fieldTypes, discipline, domain, examples, final-instruction]`. Each part is independently editable, independently reviewable.
- **`.trim()` on the parts.** So that between blocks there's exactly one `\n\n`, not three or five. A barely visible detail, but it affects token count.
- **`.join('\n\n')`.** Double newline is a structural signal to models: "new block". Anthropic models in particular respond well to structure via blank lines.

---

## Seven principles that work in prod

### 1. Role + task in the first line

```
You are a triage-form generator for an emergency-department intake desk.
Given a chief complaint, you produce a typed FormSpec describing the form a triage nurse should fill in for that complaint.
```

This gives the model a **scenario**. Without it, it tries to solve the task from scratch, and quality is jumpy. With a role — it "tries on" the tone and knowledge of a triage nurse.

**When it breaks if you remove the role:** the model starts generating generic forms, loses medical context (for example, doesn't know that SpO₂ is critical for ACS).

### 2. Documented enum of types in the prompt

```
You may use ONLY these 8 field types (anything else fails schema validation and is dropped):
- text: free-text single-line input. Optional placeholder, maxLength.
- number: numeric input. Optional min, max, unit (e.g. "mmHg", "bpm"), step.
- radio: single choice from 2+ options. ...
...
```

Why duplicate the schema in text: the JSON Schema the AI SDK generates from Zod isn't passed directly into the Anthropic prompt — it's placed into the tool definition. The model **sees** the schema, but a text description reads more easily and sticks better. This is **redundancy by design**.

**When it breaks without the text description:** the model sees the JSON Schema but doesn't understand type semantics. It may use `text` where `severity` should be, because both accept a string (at the form level — severity is a number, but in JSON it's a field with `type: "severity"`).

### 3. Output discipline rules

```
- Emit ONE JSON object that matches the FormSpec schema. No prose, no markdown, no JSX.
- Every field id must be unique within the form and descriptive snake_case (e.g. "pain_quality"). NEVER "field_3" or "q1".
- Every field must have a non-empty label suitable for a clinician-facing intake form.
- For radio/multiselect, always provide at least 2 options with both value and label set.
...
```

These are **defensive rules** against known failure modes:

- `"NEVER field_3 or q1"` — models love to generate placeholder `field_1, field_2, ...` especially on long forms. Without an explicit ban you'll be fixing eval metrics without understanding why `fieldJaccard = 0` (expected `bp_systolic`, actual `field_3`).
- `"at least 2 options"` — models sometimes generate radio with one option. The schema catches this, but a prompt-level reminder reduces the count of rejected fields.
- `"snake_case"` — because expected fixtures are snake_case. Without an explicit specification the model can return camelCase, `fieldJaccard` drops.

**Every rule here is a scar from an eval metric.** If something is extraneous — drop it. If something is needed — add it. This is a live document.

### 4. Domain-specific guidance

```
Cardiac chest-pain in adults: include a Vitals section (BP systolic+diastolic, pulse, SpO2), OPQRST...
Pediatric fever: age in months, axillary/oral/rectal temperature, duration of fever, immunization...
Behavioral / panic / anxiety: severity (0-10), onset, prior episodes, current stressors, suicidal ideation checkbox...
```

Without this the model produces generic forms. With it — it knows that chest pain needs OPQRST, and pediatric fever needs immunization status. This is **encoded domain knowledge**, and it's as valuable as the schema.

Claude Haiku 4.5 knows basic medicine, but doesn't know **which exactly** fields matter for a triage nurse in a specific clinic. Domain guidance is local knowledge that can't be left to the model's guesswork.

### 5. Few-shot examples (3 is the magic number)

`intake/few-shot.ts` contains **three** examples: chest-pain-adult, pediatric-fever, anxiety-panic. Each is a complete complaint → complete FormSpec.

Why exactly 3:

- **1 example** — the model copies the structure too literally. If the first example has a `vitals` section, the model will stick `vitals` everywhere, including cases where it isn't needed.
- **2 examples** — the model generalizes, but poorly. On a third edge case it often falls apart.
- **3 examples** — the model sees **different** patterns (cardiac/pediatric/behavioral) and understands that approach varies by category.
- **4-5+ examples** — token cost grows linearly (every example ~500 tokens), quality — sublinearly. By our evals 3 gives almost the same as 5.

**When it breaks if all 3 examples are uniform** (all — chest pain): the model works perfectly on chest pain, falls apart on everything else. Few-shot diversity > few-shot count.

### 6. Output reminder at the end

```
Now generate the FormSpec for the user-provided complaint. Output JSON only.
```

This is an **anchor** — the last instruction before generation. Models tend to forget instructions that are far from the generation point. A final "JSON only" reminder reduces the risk of a markdown-fence wrapper.

### 7. Versioning

`PROMPT_VERSION = 'v1.0.0'`. Every prompt change = version bump. Semver convention (my personal one):

- **patch** (`v1.0.1`): typos, formatting, adding trim.
- **minor** (`v1.1.0`): a new rule in discipline, a new domain-guidance case, adding a few-shot example.
- **major** (`v2.0.0`): change of role/task, removal of a required rule (which may invalidate old expected fixtures).

**When it breaks without versions:** an eval run mixes results from different prompts. The degradation chart becomes meaningless.

---

## Iteration loop

When an eval metric drops:

1. **Find failing complaints.** Open `evals/results.json`, find per-complaint scores with low `fieldJaccard` or `criticalFieldHit: false`.
2. **Run it by hand.** In `pnpm dev` send this complaint, look at the final JSON.
3. **Compare with expected.** Open `fixtures/expected/{id}.json`. What's missing? What's extra?
4. **Form a hypothesis.** "The model forgot vitals on complaint X — I'll add an explicit rule to `domainGuidance`."
5. **Minimal change.** Don't rewrite the prompt wholesale. Add one line.
6. **Bump version.** `v1.0.0` → `v1.1.0`.
7. **Run evals.** `pnpm eval`.
8. **Compare.** Did aggregate improve? Did the target complaint improve? **Did anything degrade?** (This is the most important question — prompt changes often fix one thing and break another.)
9. **If regression in another complaint — iterate.** A prompt is zero-sum: the model's attention is limited, adding rule X reduces priority of rules Y and Z.

**When it breaks if you skip step 8:** you break more than you fix, and don't know it until users complain. With evals — you see it immediately.

---

## Tactical patterns

### Don't hand-write JSON schema into the prompt

The schema is passed via `streamText({ output: Output.object({ schema }) })`, the model sees it in the tool-definition and in structured-output mode. The text description is a **complement**, not a duplicate of the exact schema format.

### Use XML tags for sections (for Claude)

Claude (both Haiku and Sonnet) parses XML structure inside the prompt well:

```
<role>
You are a triage-form generator.
</role>

<rules>
- Emit one JSON object...
- Field IDs must be snake_case.
</rules>

<examples>
<example>
Complaint: ...
FormSpec: {...}
</example>
</examples>
```

In this project we use plain text blocks via `\n\n` (because for three models at once — Claude, GPT, Gemini — XML may be suboptimal for non-Anthropic). If we were optimizing only for Claude — I'd rewrite to XML.

### Caching the system prompt

Anthropic has prompt caching (cache_control). If you have a long (~4KB like ours) and stable system prompt, you can put a cache mark on the stable part. This saves tokens on repeat eval runs (same fixture — same system prompt — cached input × 90% discount).

AI SDK v6 supports this via `providerOptions.anthropic.cacheControl`. Not set up in this project — on 20 fixtures × a few runs the savings are small; in prod with 1000+ RPS — mandatory.

### Few-shot via JSON objects, not markdown-encoded

In our prompt:

```ts
function renderExample(idx: number, example: { complaint: string; formSpec: unknown }) {
  return `Example ${idx + 1}\nComplaint: ${example.complaint}\nFormSpec:\n${JSON.stringify(example.formSpec)}`;
}
```

Not `JSON.stringify(_, null, 2)` — without pretty-print. Why: compact JSON saves tokens without losing quality. Models parse JSON the same way with and without indent.

**When it breaks with pretty-print:** on 3 examples ~1500 extra tokens (whitespace). On 100 evals × cost — a noticeable sum.

---

## Anti-patterns

- **Long multi-step instructions "first do X, then Y, then Z"** — the model forgets the order. Better — one rule per requirement.
- **"Be creative!" / "Use your best judgment!"** — increases variance, decreases reproducibility. Eval metrics bounce.
- **"DO NOT EVER do X" in caps** — works, but also makes the model more defensive overall. Use sparingly.
- **Stringifying the whole prompt into one line without structure** — the model doesn't see boundaries. Metrics drop by 5-15%.
- **Changing the prompt without a version bump** — even a small one. Otherwise you lose the ability to investigate.

---

## What to show in an interview

1. `intake/prompt.ts` — "here's the prompt, assembled from 7 blocks, versioned, with domain guidance".
2. `intake/few-shot.ts` — "3 examples of different categories, not uniform".
3. `PROMPT_VERSION` in `prompt.ts` + the `submit` event in the log — "here's how I attribute regressions to the prompt version".
4. A concrete prompt diff — "here I added a `domainGuidance` line about pediatric immunizations, eval `criticalFieldHit` for category `peds` grew from 0.85 to 1.0, the rest didn't suffer".
5. Anti-history — "here's version v1.0.0-rc that I shipped and rolled back, because fieldJaccard in the `anxiety` category dropped from 0.8 to 0.6 — it's gone from git, but described in `DECISIONS.md`".

---

## Further reading

- [Anthropic — prompt engineering guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) — guidelines from Anthropic for Claude
- [Anthropic — XML tags](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags) — why XML structures the prompt better
- [Anthropic — prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — how to cache stable blocks
- [OpenAI — prompt engineering guide](https://platform.openai.com/docs/guides/prompt-engineering) — GPT-specific patterns (useful for cross-model evals)
- [Claude prompt library](https://docs.anthropic.com/en/prompt-library) — production prompts from Anthropic for inspiration
