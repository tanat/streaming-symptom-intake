import type { FieldDescriptor } from '@/schemas/v1/fields';
import type { DeepPartial } from 'ai';

/**
 * Render-gate for partial fields arriving from `useObject` mid-stream.
 *
 * Returns `true` only when the field has the minimum data required to
 * mount its component without crashing. The renderer skips fields that
 * fail this check; on the next delta, the field reappears once the
 * required props arrive.
 *
 * This is the core partial-render-safety primitive. See ARCHITECTURE.md
 * "Streaming partial-render safety".
 */
export function isFieldRenderable(
  partial: DeepPartial<FieldDescriptor> | undefined | null,
): partial is FieldDescriptor {
  if (!partial) return false;
  if (typeof partial.id !== 'string' || partial.id.length === 0) return false;
  if (typeof partial.label !== 'string' || partial.label.length === 0)
    return false;
  if (typeof partial.type !== 'string') return false;

  switch (partial.type) {
    case 'radio':
    case 'multiselect': {
      const opts = partial.options;
      if (!Array.isArray(opts) || opts.length < 2) return false;
      for (const o of opts) {
        if (!o) return false;
        if (typeof o.value !== 'string' || o.value.length === 0) return false;
        if (typeof o.label !== 'string' || o.label.length === 0) return false;
      }
      return true;
    }
    case 'slider': {
      return (
        typeof partial.min === 'number' && typeof partial.max === 'number'
      );
    }
    case 'text':
    case 'number':
    case 'severity':
    case 'date':
    case 'checkbox':
      return true;
    default:
      // Unknown type — let the registry/Zod reject it.
      return false;
  }
}
