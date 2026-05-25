import type { FormSpec } from '@/schemas/v1/form-spec';

export type ExpectedShape = {
  complaintId: string;
  expectedSectionIds: string[];
  expectedFieldIds: string[];
  criticalFieldIds: string[];
};

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export type ComplaintScore = {
  complaintId: string;
  fieldJaccard: number;
  sectionJaccard: number;
  criticalFieldHit: boolean;
  criticalFieldHitRate: number;
  partialRenderSafe: boolean;
  timeToFirstFieldMs: number | null;
  totalMs: number | null;
};

export function scoreComplaint(
  actual: FormSpec,
  expected: ExpectedShape,
  meta: {
    partialRenderSafe: boolean;
    timeToFirstFieldMs: number | null;
    totalMs: number | null;
  },
): ComplaintScore {
  const actualSectionIds = new Set(actual.sections.map((s) => s.id));
  const actualFieldIds = new Set(
    actual.sections.flatMap((s) => s.fields.map((f) => f.id)),
  );
  const expectedSectionIds = new Set(expected.expectedSectionIds);
  const expectedFieldIds = new Set(expected.expectedFieldIds);
  const criticalSet = new Set(expected.criticalFieldIds);

  const sectionJaccard = jaccard(actualSectionIds, expectedSectionIds);
  const fieldJaccard = jaccard(actualFieldIds, expectedFieldIds);
  let criticalHits = 0;
  for (const id of criticalSet) if (actualFieldIds.has(id)) criticalHits += 1;
  const criticalFieldHitRate =
    criticalSet.size === 0 ? 1 : criticalHits / criticalSet.size;
  const criticalFieldHit = criticalHits === criticalSet.size;

  return {
    complaintId: expected.complaintId,
    fieldJaccard,
    sectionJaccard,
    criticalFieldHit,
    criticalFieldHitRate,
    partialRenderSafe: meta.partialRenderSafe,
    timeToFirstFieldMs: meta.timeToFirstFieldMs,
    totalMs: meta.totalMs,
  };
}

export type Aggregate = {
  fieldJaccard: number;
  sectionJaccard: number;
  criticalFieldHit: number;
  criticalFieldHitRate: number;
  partialRenderSafe: number;
  timeToFirstFieldP50Ms: number | null;
  timeToFirstFieldP95Ms: number | null;
};

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function aggregate(scores: ComplaintScore[]): Aggregate {
  const ttff = scores
    .map((s) => s.timeToFirstFieldMs)
    .filter((x): x is number => typeof x === 'number');
  return {
    fieldJaccard: mean(scores.map((s) => s.fieldJaccard)),
    sectionJaccard: mean(scores.map((s) => s.sectionJaccard)),
    criticalFieldHit: mean(scores.map((s) => (s.criticalFieldHit ? 1 : 0))),
    criticalFieldHitRate: mean(scores.map((s) => s.criticalFieldHitRate)),
    partialRenderSafe: mean(scores.map((s) => (s.partialRenderSafe ? 1 : 0))),
    timeToFirstFieldP50Ms: percentile(ttff, 50),
    timeToFirstFieldP95Ms: percentile(ttff, 95),
  };
}
