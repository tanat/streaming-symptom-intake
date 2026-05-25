import { describe, it, expect } from 'vitest';
import { fewShotExamples } from '../few-shot';
import { isFieldRenderable } from '@/fields/__helpers__/is-renderable';
import { fieldKey } from '@/fields/__helpers__/stable-key';
import { FieldDescriptor } from '@/schemas/v1/fields';

/**
 * Generate progressive partials of the same shape that
 * `streamObject`'s `DeepPartial` view would. Walks the object and
 * yields slices that progressively reveal more keys, simulating the
 * model emitting fields in waves.
 */
function* partialSlices(value: unknown): Generator<unknown> {
  if (Array.isArray(value)) {
    for (let i = 1; i <= value.length; i++) {
      const slice = value.slice(0, i);
      yield slice;
      yield slice.map((el) => {
        if (el && typeof el === 'object') {
          // also expose a partial of the last element
          return Object.fromEntries(
            Object.entries(el).slice(0, Math.max(1, Object.keys(el).length - 1)),
          );
        }
        return el;
      });
    }
    return;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    for (let i = 1; i <= entries.length; i++) {
      yield Object.fromEntries(entries.slice(0, i));
    }
  }
}

describe('partial stream replay through guards', () => {
  it('progressive slices of every few-shot field never sneak past guards into invalid component props', () => {
    for (const ex of fewShotExamples) {
      for (const section of ex.formSpec.sections) {
        for (const field of section.fields) {
          const slices = Array.from(partialSlices(field));
          for (const slice of slices) {
            const renderable = isFieldRenderable(
              slice as Parameters<typeof isFieldRenderable>[0],
            );
            if (!renderable) continue;
            // If we say it's renderable, Zod must agree. This is the
            // critical invariant: the renderer trusts the guard, but
            // the guard must never disagree with the schema.
            const parsed = FieldDescriptor.safeParse(slice);
            expect(parsed.success).toBe(true);
            // And the composite key must be derivable.
            expect(() =>
              fieldKey(slice as { id?: string; type?: string }),
            ).not.toThrow();
          }
        }
      }
    }
  });

  it('every fully-formed field passes both guards', () => {
    for (const ex of fewShotExamples) {
      for (const section of ex.formSpec.sections) {
        for (const field of section.fields) {
          expect(isFieldRenderable(field)).toBe(true);
          expect(FieldDescriptor.safeParse(field).success).toBe(true);
        }
      }
    }
  });
});
