import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { ComplaintScore, Aggregate } from '@/evals/score';

type Run = {
  runId: string;
  schemaVersion: string;
  promptVersion: string;
  model: string;
  perComplaint: ComplaintScore[];
  aggregate: Aggregate;
};

async function loadResults(): Promise<Run[]> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), 'evals', 'results.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Run[]) : [];
  } catch {
    return [];
  }
}

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtMs(x: number | null | undefined) {
  if (x === null || x === undefined) return '—';
  return `${x.toFixed(0)} ms`;
}

export default async function EvalPage() {
  const runs = await loadResults();
  const last = runs[runs.length - 1];
  const recent = runs.slice(-5).reverse();

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:py-12">
      <header className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="grid gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Eval results
          </h1>
          <p className="text-sm text-muted-foreground">
            Offline accuracy and latency for the form generator.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ← Back to intake
        </Link>
      </header>

      {!last ? (
        <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
          No eval runs yet. Run <code>pnpm eval</code> (or{' '}
          <code>pnpm eval:gpt-mini</code>) to populate this view.
        </div>
      ) : (
        <>
          <section className="grid gap-2">
            <h2 className="text-lg font-semibold">
              Latest run — {last.model}
            </h2>
            <p className="text-xs text-muted-foreground">
              {last.runId} · prompt {last.promptVersion} · schema{' '}
              {last.schemaVersion}
            </p>
            <div className="grid gap-3 rounded-xl border bg-card p-5 shadow-sm ring-1 ring-foreground/[0.03] sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label="Critical field coverage"
                value={pct(last.aggregate.criticalFieldHitRate)}
                hint="Share of must-have fields the form included"
              />
              <Stat
                label="Partial-render safe"
                value={pct(last.aggregate.partialRenderSafe)}
                hint="Every streamed partial validated & rendered cleanly"
              />
              <Stat
                label="TTFF p50 / p95"
                value={`${fmtMs(last.aggregate.timeToFirstFieldP50Ms)} / ${fmtMs(last.aggregate.timeToFirstFieldP95Ms)}`}
                hint="Time to first field on screen"
              />
              <Stat
                label="Field-ID overlap"
                value={pct(last.aggregate.fieldJaccard)}
                hint="Exact field-id match vs a hand-authored target — strict by design, not an accuracy score"
              />
              <Stat
                label="Section-ID overlap"
                value={pct(last.aggregate.sectionJaccard)}
                hint="Exact section-id match vs the target"
              />
              <Stat
                label="All critical fields"
                value={pct(last.aggregate.criticalFieldHit)}
                hint="All-or-nothing per complaint — the strictest cut"
              />
            </div>
          </section>

          <section className="grid gap-2">
            <h2 className="text-lg font-semibold">Per-complaint detail</h2>
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm ring-1 ring-foreground/[0.03]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Complaint</th>
                    <th className="px-3 py-2 font-medium">Field J.</th>
                    <th className="px-3 py-2 font-medium">Section J.</th>
                    <th className="px-3 py-2 font-medium">Critical</th>
                    <th className="px-3 py-2 font-medium">PR-safe</th>
                    <th className="px-3 py-2 font-medium">TTFF</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {last.perComplaint.map((s) => (
                    <tr key={s.complaintId} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">
                        {s.complaintId}
                      </td>
                      <td className="px-3 py-2">{pct(s.fieldJaccard)}</td>
                      <td className="px-3 py-2">{pct(s.sectionJaccard)}</td>
                      <td className="px-3 py-2">
                        {s.criticalFieldHit ? '✓' : pct(s.criticalFieldHitRate)}
                      </td>
                      <td className="px-3 py-2">
                        {s.partialRenderSafe ? '✓' : '✗'}
                      </td>
                      <td className="px-3 py-2">{fmtMs(s.timeToFirstFieldMs)}</td>
                      <td className="px-3 py-2">{fmtMs(s.totalMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {recent.length > 1 ? (
            <section className="grid gap-2">
              <h2 className="text-lg font-semibold">Recent runs side-by-side</h2>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm ring-1 ring-foreground/[0.03]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">Field J.</th>
                      <th className="px-3 py-2 font-medium">Section J.</th>
                      <th className="px-3 py-2 font-medium">Critical</th>
                      <th className="px-3 py-2 font-medium">PR-safe</th>
                      <th className="px-3 py-2 font-medium">TTFF p50</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.runId} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.runId}
                        </td>
                        <td className="px-3 py-2">{r.model}</td>
                        <td className="px-3 py-2">
                          {pct(r.aggregate.fieldJaccard)}
                        </td>
                        <td className="px-3 py-2">
                          {pct(r.aggregate.sectionJaccard)}
                        </td>
                        <td className="px-3 py-2">
                          {pct(r.aggregate.criticalFieldHit)}
                        </td>
                        <td className="px-3 py-2">
                          {pct(r.aggregate.partialRenderSafe)}
                        </td>
                        <td className="px-3 py-2">
                          {fmtMs(r.aggregate.timeToFirstFieldP50Ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
      {hint ? (
        <div className="text-[0.7rem] leading-snug text-muted-foreground/80">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
