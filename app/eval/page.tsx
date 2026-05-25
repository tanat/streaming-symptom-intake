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
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Eval results</h1>
        <Link href="/" className="text-sm underline">
          ← back to intake
        </Link>
      </header>

      {!last ? (
        <div className="rounded border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
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
            <div className="grid gap-3 rounded border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="Field Jaccard" value={pct(last.aggregate.fieldJaccard)} />
              <Stat
                label="Section Jaccard"
                value={pct(last.aggregate.sectionJaccard)}
              />
              <Stat
                label="Critical hit"
                value={pct(last.aggregate.criticalFieldHit)}
              />
              <Stat
                label="Critical hit rate"
                value={pct(last.aggregate.criticalFieldHitRate)}
              />
              <Stat
                label="Partial-render safe"
                value={pct(last.aggregate.partialRenderSafe)}
              />
              <Stat
                label="TTFF p50 / p95"
                value={`${fmtMs(last.aggregate.timeToFirstFieldP50Ms)} / ${fmtMs(last.aggregate.timeToFirstFieldP95Ms)}`}
              />
            </div>
          </section>

          <section className="grid gap-2">
            <h2 className="text-lg font-semibold">Per-complaint detail</h2>
            <div className="overflow-x-auto rounded border bg-card">
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
              <div className="overflow-x-auto rounded border bg-card">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
