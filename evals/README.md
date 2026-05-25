# Evals

## Running

```bash
# Default: claude-haiku-4-5
pnpm eval

# OpenAI comparison
pnpm eval:gpt-mini
```

Each run appends one entry to `results.json`. Never edit existing entries — they are the historical record.

## Required env

- `ANTHROPIC_API_KEY` — required for default `pnpm eval` run.
- `OPENAI_API_KEY` — required for `pnpm eval:gpt-mini`.

Drop them into `.env.local` (loaded by Next.js automatically when used via the dev server) or export them in your shell when running the harness directly with `tsx`.

## What it measures

Per complaint:

- `fieldJaccard` — intersection-over-union of emitted vs expected field IDs.
- `sectionJaccard` — same but at section granularity.
- `criticalFieldHit` — `true` only when *every* `criticalFieldIds` in `fixtures/expected/<id>.json` is present.
- `criticalFieldHitRate` — fraction (helps diagnose partial misses).
- `partialRenderSafe` — `true` if every partial delta that passed `isFieldRenderable` *also* passed Zod `safeParse`. The whole point of Phase 6.
- `timeToFirstFieldMs` — how long until the first field becomes renderable.
- `totalMs` — full stream duration.

Aggregate per run: macro-mean for each metric, p50 and p95 for time-to-first-field.

## Curating expected files

The expected lists describe what a senior triage nurse would actually want, *not* what the model happens to emit. When the model surprises us with a useful field, we may add it; when it produces a generic field that misses the point of the complaint, we leave it out. Field IDs in `expectedFieldIds` are the IDs we want the model to emit (the prompt teaches snake_case descriptive IDs).

`criticalFieldIds` is the must-not-miss subset — fields whose absence would change clinical decision-making.
