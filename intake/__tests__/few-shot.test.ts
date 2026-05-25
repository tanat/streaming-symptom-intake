import { describe, it, expect } from 'vitest';
import { fewShotExamples } from '../few-shot';
import { FormSpec } from '@/schemas/v1/form-spec';
import { intakeSystemPrompt, PROMPT_VERSION } from '../prompt';

describe('few-shot examples', () => {
  it('all examples validate against FormSpec', () => {
    for (const ex of fewShotExamples) {
      const result = FormSpec.safeParse(ex.formSpec);
      if (!result.success) {
        throw new Error(
          `Example "${ex.complaint}" failed FormSpec validation: ${JSON.stringify(result.error.issues, null, 2)}`,
        );
      }
      expect(result.success).toBe(true);
    }
  });

  it('covers cardiac, pediatric, and behavioral categories', () => {
    expect(fewShotExamples).toHaveLength(3);
    const categories = fewShotExamples.map(
      (ex) => ex.formSpec.triageContext.suspectedCategory ?? '',
    );
    expect(categories.some((c) => /cardiac|coronary|ACS/i.test(c))).toBe(true);
    expect(categories.some((c) => /pediatric|febrile/i.test(c))).toBe(true);
    expect(categories.some((c) => /anxiety|panic/i.test(c))).toBe(true);
  });

  it('every field id is unique within its form and snake_case', () => {
    for (const ex of fewShotExamples) {
      const ids: string[] = [];
      for (const section of ex.formSpec.sections) {
        for (const field of section.fields) {
          ids.push(field.id);
          expect(field.id).toMatch(/^[a-z][a-z0-9_]*$/);
        }
      }
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('intakeSystemPrompt', () => {
  it('exports a non-empty prompt and version', () => {
    expect(PROMPT_VERSION).toBe('v1.0.0');
    expect(intakeSystemPrompt.length).toBeGreaterThan(500);
    expect(intakeSystemPrompt).toContain('FormSpec');
  });

  it('embeds all 3 few-shot examples', () => {
    expect(intakeSystemPrompt).toContain('Example 1');
    expect(intakeSystemPrompt).toContain('Example 2');
    expect(intakeSystemPrompt).toContain('Example 3');
  });
});
