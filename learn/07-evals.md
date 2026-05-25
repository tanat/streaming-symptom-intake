# Stage 7 — Evals: measure, don't feel

Unit tests answer "works / doesn't work". With AI that question makes no sense. The model **always** returns something; the question is how well that something matches what's needed. Evals are a set of metrics that turn "I have a feeling it got worse" into "fieldJaccard dropped from 0.81 to 0.74".

In this project evals are `evals/harness.ts` + `evals/score.ts` + `fixtures/`.

---

## Eval harness structure

```
fixtures/
  complaints.json              ← 20 input complaints with id and category
  expected/
    chest-pain-female-55.json  ← expected sections, fields, critical fields
    pediatric-fever-toddler.json
    ...

evals/
  harness.ts                   ← pnpm eval — run fixtures, write the result
  score.ts                     ← jaccard, scoreComplaint, aggregate
  results.json                 ← append-only history of runs
```

Each run (`pnpm eval`) does:

1. Loads 20 complaints from `fixtures/complaints.json`.
2. For each — runs `streamText({ output: Output.object({ schema }) })` against a real model (via `gateway(...)` for Anthropic/OpenAI or `google(...)` for Gemini 2.5 Flash).
3. Replays every partial through `isFieldRenderable` — this is the `partialRenderSafe` metric.
4. From the final `object` computes: `sectionJaccard`, `fieldJaccard`, `criticalFieldHit`, `criticalFieldHitRate`.
5. Measures `timeToFirstFieldMs`, `totalMs`.
6. Aggregates over all 20: macro-mean, p50, p95.
7. Appends the result to `results.json` with `runId`, `schemaVersion`, `promptVersion`, `model`.

---

## Why Jaccard, not LLM-as-judge

LLM-as-judge is a trendy pattern: you give GPT-5 or Claude Opus the job of judging how well the form matches the complaint. Convenient, flexible, **but a poor fit for this project**. Here's why.

**LLM-as-judge fits when:**
- Output is free text, no clear "right" answer.
- Style, tone, fluency matter.
- You're ready to pay ×4-10 per eval run.
- You're willing to live with judge bias (calibration, length bias, family bias).

**Jaccard fits when:**
- Output is structured data with discrete elements (field IDs).
- "Correct" means "contains certain fields, doesn't contain extras".
- You want a cheap, deterministic, reproducible metric.
- You're willing to spend 5 minutes putting together expected fixtures.

This project is case 2. We score the form by its set of fields. The metric is set-intersection / set-union. It is:
- **Reproducible.** The same spec gives the same score, always.
- **Cheap.** Running 20 fixtures × 1 model — only the cost of generating forms, no +N tokens for a judge.
- **Explainable.** A score drop = new/missed field IDs. The diff is easy to eyeball.

**When to add LLM-judge anyway:**
- Scoring **wording** of label/placeholder — detail that Jaccard doesn't catch.
- Scoring **section order** — Jaccard ignores it.
- Scoring `redFlags` — Jaccard on free text doesn't work (you need semantic similarity).

In this project we deliberately stick with Jaccard. If you ever extend — add LLM-judge as an **additional** metric, not a replacement.

---

## Metric 1: Field-set Jaccard

```ts
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
```

On complaint "chest-pain-female-55":
- Actual: `{ bp_systolic, bp_diastolic, pulse, spo2, pain_onset, pain_quality, pain_radiation, pain_severity }`
- Expected: `{ bp_systolic, bp_diastolic, pulse, spo2, pain_quality, pain_radiation, pain_severity, hx_htn, hx_dm }`
- Intersection: 7 (everything except `pain_onset`, `hx_htn`, `hx_dm`)
- Union: 10
- Jaccard: 0.70

**What Jaccard says:** "you overlapped expected by 70% of fields, you have ~30% missing/extra".

**What Jaccard doesn't say:**
- *Which exactly* fields are missing. (The log makes this explicit — see evals/results.json + diff.)
- Whether missing/extra fields are important. (Metric 3 handles this.)
- Whether the label wording is correct. (Not solved by this.)

---

## Metric 2: Section-set Jaccard

Same logic but over section IDs. Useful because:
- If all fields are right but placed in a single "Misc" section instead of "Vitals" + "OPQRST" + "Cardiac risk" — Jaccard on fields is high, on sections low.
- That points to **structural** form errors.

In this project sections aren't that important (a triage nurse will manage with any grouping), but the metric is cheap and kept.

---

## Metric 3: Critical field hit

Not all missing fields are equal. If for suspected ACS the model forgot `spo2` — that's a critical error (regardless of Jaccard). If it forgot `family_history_cad` — that's just slight degradation.

In expected fixtures:

```json
{
  "complaintId": "chest-pain-female-55",
  "expectedSectionIds": ["vitals", "opqrst", "cardiac_risk"],
  "expectedFieldIds": [...18 IDs...],
  "criticalFieldIds": ["bp_systolic", "spo2", "pain_quality", "pain_severity"]
}
```

`criticalFieldHit: boolean` — true only if **all** critical IDs are present. `criticalFieldHitRate: number` — fraction of present among critical.

Why two variants:
- `criticalFieldHit` (binary) — for threshold alerting: "never ship a prompt if this score drops below 1.0".
- `criticalFieldHitRate` (continuous) — for trend analysis: you see a gradual drop from 1.0 to 0.95.

---

## Metric 4: partialRenderSafe

```ts
for await (const partial of result.partialOutputStream) {
  const sections = partial?.sections ?? [];
  for (const section of sections) {
    for (const field of section?.fields ?? []) {
      if (isFieldRenderable(field as any)) {
        if (firstFieldAt === null) firstFieldAt = Date.now() - start;
        // Belt-and-suspenders check: if guard says renderable but Zod disagrees, that would crash.
        if (!FieldDescriptor.safeParse(field).success) {
          partialRenderSafe = false;
        }
      }
    }
  }
}
```

What this checks: **on every partial, every field that passes the render-gate must pass the full Zod parse.** This is a runtime check of the invariant that the unit test `partial-render.test.ts` checks statically.

If on any delta any field passes `isFieldRenderable` but fails `FieldDescriptor.safeParse` — `partialRenderSafe = false`. This metric must be `1.0` for all 20 complaints. If it drops — you have a bug in the guard, not the model.

---

## Metrics 5-6: latency p50/p95

```ts
function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
```

- `timeToFirstFieldP50Ms` — half of runs fit in this ms or less.
- `timeToFirstFieldP95Ms` — 95% fit.

Why not mean: latency is skewed, the mean is pulled by outliers, p95 is more informative for UX discussions. "1 in 20 users waits longer than X seconds" — a concrete statement.

**When it breaks if you look at the mean:** one outlier (server hiccup, retry, etc.) shifts the mean by 30%, you decide you have a regression, spend a day debugging — and it's noise on 1 of 20 runs.

---

## Aggregate result entry

```ts
const entry = {
  runId: new Date().toISOString(),     // ISO timestamp = unique sortable runId
  schemaVersion: SCHEMA_VERSION,       // "v1.0.0"
  promptVersion: PROMPT_VERSION,       // "v1.0.0"
  model: modelId,                       // "claude-haiku-4-5"
  perComplaint: scores,                 // 20 ComplaintScore
  aggregate: agg,                       // macro-means + percentiles
};
```

**What's not obvious here:**

- **`runId` — ISO timestamp.** Sortable lexicographically. Not UUID — UUIDs don't sort by time, and eval history is viewed in run order.
- **`schemaVersion` + `promptVersion` + `model`.** Without these three you can't compare runs. "fieldJaccard dropped" — that could be from a model change, a prompt change, or expected-fixture changes. With all three versions, you can tell them apart.
- **`perComplaint` in full.** Not just aggregate. Why: aggregate hides local regressions. If 19 complaints improved and one tanked hard — aggregate says "got better", when in fact you broke one category. Per-complaint diff shows it.

---

## Eval lifecycle

1. **Changed prompt.** Bump `PROMPT_VERSION` (minor: wording, patch: typo fix).
2. **Run `pnpm eval`.** A new entry is written with the new `promptVersion`.
3. **Open `/eval` (`app/eval/page.tsx`).** You see aggregate comparison with the previous run.
4. **Look at per-complaint diff:** which complaints degraded, which improved.
5. **A regression is:** `fieldJaccard` dropped > 0.05, **or** `criticalFieldHit` dropped, **or** `partialRenderSafe` < 1.0.
6. **If regression — roll the prompt back or refine it.** Again `pnpm eval`. Loop.

**When it breaks if you don't version promptVersion:** all runs of one "version" blur together on charts, and you don't see which run is pinned to which prompt. Impossible to attribute regressions.

---

## Eval pipeline in CI/CD (which we didn't do here, but should)

```yaml
# .github/workflows/eval.yml — pseudo
on: pull_request
jobs:
  eval:
    steps:
      - pnpm eval
      - upload-artifact: evals/results.json
      - github-script: |
          compare the last two entries in results.json
          if fieldJaccard dropped > 0.05 — comment on the PR
          if criticalFieldHit dropped — fail the job
```

This project doesn't have it (it's a learning project). In prod — mandatory. Without CI evals you'll ship prompts without checking quality.

---

## Dataset size: 20 — is that too few?

For a learning project — fine. For prod — too few. Guideline:

- **<20 fixtures**: smoke only. Signal/noise is bad; aggregate jumps by ±0.05.
- **20-100 fixtures**: typical smoke suite, big regressions are visible.
- **100-500 fixtures**: full regression suite, category regressions are visible.
- **500+**: production eval with breakdown by segment (categories, languages, complexity).

To expand fixtures cheaply, you can use an LLM to generate new complaints + manually validate the expected shape. But `expected` fixtures **must** be human-reviewed — otherwise you're validating the model against itself.

---

## What to show in an interview

1. `evals/score.ts` — "here are four metrics on set-intersection; deterministic, cheap, explainable".
2. `evals/harness.ts` — "here's the replay of every partial through the render-gate; partialRenderSafe = 1.0 on 20 complaints — that's the proof of safety".
3. `evals/results.json` — "here's the append-only history; you can see the trend across prompt versions".
4. `/eval` page (`app/eval/page.tsx`) — "here's the UI that reads results.json and shows the aggregate".
5. **A concrete example** — "here's when I changed the prompt from X to Y, fieldJaccard grew from 0.74 to 0.81, but criticalFieldHit dropped from 1.0 to 0.95 — because the model got more 'creative' and lost vitals. I rolled it back".

---

## Further reading

- [LLM-as-judge guide](https://www.openlayer.com/blog/post/llm-as-judge-evaluation-guide) — when applicable, which biases to account for
- [LLM-as-judge best practices](https://futureagi.com/blog/llm-as-judge-best-practices-2026) — calibration, family bias, cost control
- [Jaccard similarity (Wikipedia)](https://en.wikipedia.org/wiki/Jaccard_index) — formula and properties
- [Anthropic Claude — evals cookbook](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/evaluations) — production eval patterns
- [Braintrust](https://braintrust.dev) / [Langfuse](https://langfuse.com) — managed eval platforms for teams ready to move off self-hosted NDJSON
