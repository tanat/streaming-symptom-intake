import { describe, it, expect } from 'vitest';
import { jaccard, scoreComplaint, aggregate } from '../score';
import type { FormSpec } from '@/schemas/v1/form-spec';

describe('jaccard', () => {
  it('returns 1 for two empty sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
  });

  it('returns 1 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('returns the right ratio for partial overlap', () => {
    // intersection=1 ({b}), union=3 ({a,b,c}) → 1/3
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(
      1 / 3,
    );
  });
});

const synthetic: FormSpec = {
  triageContext: { redFlags: [] },
  sections: [
    {
      id: 'vitals',
      title: 'Vitals',
      fields: [
        { id: 'bp', type: 'text', label: 'BP' },
        { id: 'hr', type: 'text', label: 'HR' },
      ],
    },
    {
      id: 'history',
      title: 'History',
      fields: [{ id: 'pmh', type: 'text', label: 'PMH' }],
    },
  ],
};

describe('scoreComplaint', () => {
  it('computes section/field jaccard and critical hit', () => {
    const score = scoreComplaint(
      synthetic,
      {
        complaintId: 'demo',
        expectedSectionIds: ['vitals', 'history', 'pmh'],
        expectedFieldIds: ['bp', 'hr', 'pmh', 'allergies'],
        criticalFieldIds: ['bp', 'hr'],
      },
      { partialRenderSafe: true, timeToFirstFieldMs: 400, totalMs: 1500 },
    );
    // sections {vitals,history} vs {vitals,history,pmh} → 2/3
    expect(score.sectionJaccard).toBeCloseTo(2 / 3);
    // fields {bp,hr,pmh} vs {bp,hr,pmh,allergies} → 3/4
    expect(score.fieldJaccard).toBeCloseTo(3 / 4);
    expect(score.criticalFieldHit).toBe(true);
    expect(score.criticalFieldHitRate).toBe(1);
    expect(score.partialRenderSafe).toBe(true);
  });

  it('flags missing critical fields', () => {
    const score = scoreComplaint(
      synthetic,
      {
        complaintId: 'demo',
        expectedSectionIds: ['vitals'],
        expectedFieldIds: ['bp'],
        criticalFieldIds: ['bp', 'spo2'],
      },
      { partialRenderSafe: true, timeToFirstFieldMs: null, totalMs: null },
    );
    expect(score.criticalFieldHit).toBe(false);
    expect(score.criticalFieldHitRate).toBe(0.5);
  });
});

describe('aggregate', () => {
  it('macro-means each metric and computes percentiles', () => {
    const scores = [
      {
        complaintId: 'a',
        fieldJaccard: 0.8,
        sectionJaccard: 1,
        criticalFieldHit: true,
        criticalFieldHitRate: 1,
        partialRenderSafe: true,
        timeToFirstFieldMs: 400,
        totalMs: 1000,
      },
      {
        complaintId: 'b',
        fieldJaccard: 0.6,
        sectionJaccard: 0.5,
        criticalFieldHit: false,
        criticalFieldHitRate: 0.5,
        partialRenderSafe: true,
        timeToFirstFieldMs: 800,
        totalMs: 2000,
      },
    ];
    const agg = aggregate(scores);
    expect(agg.fieldJaccard).toBeCloseTo(0.7);
    expect(agg.sectionJaccard).toBeCloseTo(0.75);
    expect(agg.criticalFieldHit).toBeCloseTo(0.5);
    expect(agg.partialRenderSafe).toBe(1);
    expect(agg.timeToFirstFieldP50Ms).toBe(400);
    expect(agg.timeToFirstFieldP95Ms).toBe(800);
  });
});
