# Stage 6 — Observability: NDJSON event log of a session

In ordinary web you log HTTP requests and errors. With AI that's not enough. You need an **event-level stream log** — what exactly the model emitted, in what order, what it looked like at every step, and what the user ultimately saw. Without this you won't debug degradation.

In this project that's `logs/intake-streams/{sessionId}.ndjson` — an append-only stream of events in NDJSON format.

---

## Why NDJSON, not a JSON array

NDJSON (Newline Delimited JSON) — one JSON object per line, without a wrapper. The file is still valid after every write; you don't need to re-read and re-write it whole.

```
{"event":"submit","ts":"...","sessionId":"abc",...}
{"event":"delta","ts":"...","sessionId":"abc","deltaIdx":0,...}
{"event":"finish","ts":"...","sessionId":"abc",...}
```

Alternatives and why they're worse:

- **JSON array** `[{...}, {...}, ...]` — on every append you need to re-read the file, parse, push, stringify, rewrite. Expensive and race-unsafe.
- **One JSON object per session that gets mutated** — same thing + risk of concurrent writes.
- **SQL/Postgres** — overkill for local development and for immutable append-only logs; fully justified only when you need indexes and queries.
- **OpenTelemetry / structured logging** — the right production choice for big systems, but an unnecessary layer in a learning project. NDJSON can always be shipped to OTel later.

NDJSON flows into any pipe: `tail -f`, `jq`, `cat | grep | wc -l`. It's the format on which bash-first debugging rests.

---

## Anatomy of a session log

`intake/log.ts` defines a union of event types:

```ts
export type IntakeLogEvent =
  | { event: 'submit'; ts; sessionId; complaint; promptVersion; schemaVersion; model }
  | { event: 'delta'; ts; sessionId; deltaIdx; partialSpec }
  | { event: 'first_field'; ts; sessionId; timeToFirstFieldMs }
  | { event: 'finish'; ts; sessionId; totalMs; finalSpec; tokensIn?; tokensOut? }
  | { event: 'render_error'; ts; sessionId; fieldId?; error };
```

**What's not obvious here:**

- **Discriminated union on `event`.** Same as in FieldDescriptor — one discriminator, eight shapes (we have five). When reading the log you switch on `event` and TypeScript narrows the fields.
- **`promptVersion` + `schemaVersion` in `submit`.** This is critical for retrospective analysis. In a month you'll want to recompute metrics on a new scorer — you need to know which prompt this session ran under. Without these fields the log becomes useless after the first prompt change.
- **`partialSpec` in every delta.** Yes, it's expensive for storage — 50 deltas × ~2KB = 100KB per session. But it lets you replay the stream: walk the log, simulate every delta, run through `isFieldRenderable`, count which field appeared on which delta. The eval harness does roughly this.
- **`tokensIn` / `tokensOut` are optional.** The AI SDK doesn't always emit usage — depends on the provider. We write to the log as is, NULL is a valid value.

---

## What to write and when

Server (`app/api/intake/route.ts`):
- `submit` — before streamText starts. Contains complaint, model, versions.
- `finish` — in the `onFinish` callback. Contains the final `object`, usage, totalMs.

Client (`app/page.tsx`):
- `submit` — duplicated by the client log (via `/api/log`). Why? So the time baseline is counted from the client submit, not the server one — the client sees UI and network latency as part of the story.
- `delta` — on every `useEffect([spec])`. Contains `deltaIdx` and `partialSpec`.
- `first_field` — once, when the first field passes `isFieldRenderable`.
- `finish` — duplicated by the client to record the moment from the UI's point of view (including render delay).

**When it breaks if you write only the server log:**

- `time-to-first-field` will be inaccurate — the server doesn't know when the client **rendered** the field; only when it sent the delta.
- Render errors (FieldErrorBoundary catch) won't make it to the log — they're client-only.
- Drift between server and client streams isn't visible.

**When it breaks if you write only the client one:**

- Token usage disappears — the client doesn't know how much the model spent.
- If the client crashes before finish — no final record, the session "hangs".

**The solution — both, and merge by sessionId at analysis time.**

---

## Best-effort vs reliable telemetry

In `app/page.tsx`:

```tsx
function postLog(event: Record<string, unknown>) {
  void fetch('/api/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {
    // Best-effort telemetry — never block UI.
  });
}
```

**What's not obvious here:**

- **`void fetch(...)`** — deliberately not awaited. Telemetry is best-effort, doesn't block the UI for a millisecond.
- **`keepalive: true`** — the browser won't cancel the request on unmount/tab close. This is critical for the `finish` event on a page with auto-redirect.
- **`.catch(() => {})`** — silent. If `/api/log` fails, you don't want to show that to the user. But **in prod** you should see this — add a second channel at sample-rate to Sentry/Datadog: log failures via `console.error` on 1% of requests.

**When it breaks without `keepalive`:** ~5% of finish events drop on mobile, where the user closes the tab right after generation.

---

## Server: filesystem vs stderr

`intake/log.ts`:

```ts
function isWritableFs(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1';
}

export async function appendToSessionLog(sessionId, event) {
  if (!isWritableFs()) {
    process.stderr.write(JSON.stringify(event) + '\n');
    return;
  }
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[intake-log] failed: ${err.message}\n`);
  }
}
```

**What's not obvious here:**

- **Vercel = read-only FS.** On Vercel Functions you can't write to the local FS (except `/tmp`, which doesn't persist). In prod mode we write to stderr, which Vercel captures into its logs. From there — export to Datadog/Logtail/whatever.
- **`fs.appendFile` async.** One write-syscall per event. Fine for dev. In prod at 1000 RPS you need a buffer + flush every second, otherwise the FD table will suffer. (There's no such load in this project; don't optimize.)
- **try/catch around FS.** A log write must not crash the route. If the file can't be written (disk full, permissions) — write the error to stderr and move on.

---

## API `/api/log`: validation

`app/api/log/route.ts`:

```ts
const event = body as Partial<IntakeLogEvent> & { sessionId?: string };
if (typeof event.sessionId !== 'string' || !/^[a-f0-9-]{8,}$/i.test(event.sessionId)) {
  return new Response('invalid sessionId', { status: 400 });
}
if (typeof event.event !== 'string') {
  return new Response('invalid event', { status: 400 });
}
await appendToSessionLog(event.sessionId, event as IntakeLogEvent);
return new Response(null, { status: 204 });
```

**What's not obvious here:**

- **Regex on sessionId.** Without it any user can submit `sessionId: "../../etc/passwd"` and write to an arbitrary file. Even though `path.join(LOG_DIR, file)` normalizes — play it safe. The regex is a simple defense.
- **Minimal validation of event structure.** Here we could run it through an `IntakeLogEvent` Zod schema, but we didn't define one — we write whatever into the log, trusting the client to send valid structures. Trade-off: simpler code, but "dirty" events are possible.
- **204 No Content.** Telemetry returns no data. Minimal overhead.

**When it breaks without the regex:** path traversal lets you write to arbitrary FS locations on the developer's dev machine. In prod on Vercel — no (stderr only), but on self-hosted — yes.

---

## What these logs let you do afterward

### 1. Latency profiles

```bash
cat logs/intake-streams/*.ndjson \
  | jq -r 'select(.event=="first_field") | .timeToFirstFieldMs' \
  | sort -n | awk 'BEGIN{c=0} {a[c++]=$1} END{print "p50="a[int(c*0.5)]"\np95="a[int(c*0.95)]}'
```

In 1 second you know p50=480ms, p95=720ms. If tomorrow p95 creeps up — something changed (model slower? prompt got longer? more complex complaints?).

### 2. Type-flip rate

```bash
# per session — how many unique types per field.id across deltas
cat logs/intake-streams/abc.ndjson \
  | jq -r 'select(.event=="delta") | .partialSpec.sections[]?.fields[]? | "\(.id)\t\(.type)"' \
  | sort -u | awk '{print $1}' | uniq -c | awk '$1>1'
```

This gives the list of fields whose `type` changed across deltas in this session. Type-flip rate matters for evaluating the `composite key` strategy (see stage 4).

### 3. Distribution of field types

```bash
cat logs/intake-streams/*.ndjson \
  | jq -r 'select(.event=="finish") | .finalSpec.sections[].fields[].type' \
  | sort | uniq -c | sort -rn
```

You can see what the model uses and what it doesn't. Useful for deciding whether to add new types.

### 4. Render errors

```bash
cat logs/intake-streams/*.ndjson \
  | jq 'select(.event=="render_error")' | head -50
```

If `render_error` shows up — you have a case where the render-gate let garbage through. In this project FieldErrorBoundary does `console.error` without sending to `/api/log`. This is easy to extend — wire an `onError` prop into `<FieldErrorBoundary onError={...}>` and from there `postLog({ event: 'render_error', ... })`.

---

## What we deliberately don't log

- **PII in complaint** — in this project we write the full complaint into the submit event. In a medical prod context this violates HIPAA/Russian Federal Law 152-FZ. In a real product the complaint is a hash; the original is in a separate secure store with access control.
- **API keys** — "well of course". But: check carefully that they don't leak through `error.message` into `render_error`. The AI SDK sometimes includes request URLs in errors. Mask them.
- **Every single token** — `partialSpec` is enough. Per-token logs blow up storage ×10 with no benefit.

---

## Production observability stack (what this would be instead of NDJSON)

A typical stack:

- **Tracing** — OpenTelemetry; every stream is a span with child spans per delta.
- **Metrics** — Prometheus/Datadog; `time_to_first_field` as a histogram, `tokens_per_request` as a counter.
- **Logs** — Loki/Datadog Logs; same NDJSON structure, but in a centralized system.
- **LLM-specific** — Braintrust/Langfuse/Helicone; integrated with the AI SDK via middleware (see `experimental_telemetry`).

In this project NDJSON is **proof-of-concept** of what should live in OTel/Langfuse in prod. The event structure is the same.

---

## Practice

1. Run `pnpm dev`, send 3-4 different complaints.
2. Open `logs/intake-streams/` — as many files as sessions.
3. On one file:
   ```bash
   jq -c 'select(.event=="delta") | {idx: .deltaIdx, sections: (.partialSpec.sections | length // 0)}' \
     logs/intake-streams/SESSION.ndjson
   ```
   See how `sections` grows from 0 to its final count?
4. Find the delta on which the first section appeared. Compare with the `first_field` event — it must be **later** (because a section appears without fields at first, and a field requires a few more deltas).

---

## Further reading

- [DECISIONS.md — observability rationale](../../02-streaming-symptom-intake/ARCHITECTURE.md#observability) — what we want to see from the logs
- [Vercel AI SDK — telemetry](https://sdk.vercel.ai/docs/ai-sdk-core/telemetry) — `experimental_telemetry` for OTel integration
- [Braintrust integration](https://www.braintrust.dev/docs/integrations/sdk-integrations/vercel) — example of production tracing for the AI SDK
- [Langfuse for LLM apps](https://langfuse.com/docs) — alternative observability stack
- [jq manual](https://stedolan.github.io/jq/manual/) — your main tool for NDJSON analytics
