import { describe, it, expect } from 'vitest';
import { isFieldRenderable } from '@/fields/__helpers__/is-renderable';
import { fieldKey } from '@/fields/__helpers__/stable-key';

describe('isFieldRenderable', () => {
  it('rejects empty partial', () => {
    expect(isFieldRenderable({})).toBe(false);
    expect(isFieldRenderable(undefined)).toBe(false);
  });

  it('accepts a fully-formed text field', () => {
    expect(
      isFieldRenderable({ id: 'x', type: 'text', label: 'X' }),
    ).toBe(true);
  });

  it('rejects a radio field with no options', () => {
    expect(
      isFieldRenderable({ id: 'x', type: 'radio', label: 'X' }),
    ).toBe(false);
  });

  it('rejects a radio field with only one option', () => {
    expect(
      isFieldRenderable({
        id: 'x',
        type: 'radio',
        label: 'X',
        options: [{ value: 'a', label: 'A' }],
      }),
    ).toBe(false);
  });

  it('rejects a radio field with an option missing label', () => {
    expect(
      isFieldRenderable({
        id: 'x',
        type: 'radio',
        label: 'X',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b' },
        ],
      }),
    ).toBe(false);
  });

  it('accepts a radio field with two complete options', () => {
    expect(
      isFieldRenderable({
        id: 'x',
        type: 'radio',
        label: 'X',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ).toBe(true);
  });

  it('rejects a slider field with only min', () => {
    expect(
      isFieldRenderable({
        id: 'x',
        type: 'slider',
        label: 'X',
        min: 0,
      }),
    ).toBe(false);
  });

  it('accepts a slider field with both min and max', () => {
    expect(
      isFieldRenderable({
        id: 'x',
        type: 'slider',
        label: 'X',
        min: 0,
        max: 10,
      }),
    ).toBe(true);
  });

  it('accepts a checkbox field with only base props', () => {
    expect(
      isFieldRenderable({ id: 'x', type: 'checkbox', label: 'X' }),
    ).toBe(true);
  });

  it('accepts a multiselect field with two complete options', () => {
    expect(
      isFieldRenderable({
        id: 'x',
        type: 'multiselect',
        label: 'X',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ).toBe(true);
  });
});

describe('fieldKey', () => {
  it('returns id::type for valid input', () => {
    expect(fieldKey({ id: 'x', type: 'radio' })).toBe('x::radio');
  });

  it('throws when id is missing', () => {
    expect(() => fieldKey({ type: 'radio' })).toThrow();
  });

  it('throws when type is missing', () => {
    expect(() => fieldKey({ id: 'x' })).toThrow();
  });
});
