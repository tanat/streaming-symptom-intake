/**
 * Composite React key for a streamed field. Must be called only on
 * fields that have already passed `isFieldRenderable`, which guarantees
 * `id` and `type` are non-empty strings.
 *
 * Composite key (`${id}::${type}`) is critical for type-flip handling:
 * if the model changes a field's `type` between deltas, the key
 * changes, React unmounts the old component cleanly and mounts the new
 * one — instead of trying to reuse one component as another.
 */
export function fieldKey(field: { id?: string; type?: string }): string {
  if (typeof field.id !== 'string' || field.id.length === 0) {
    throw new Error('fieldKey called on field without id');
  }
  if (typeof field.type !== 'string' || field.type.length === 0) {
    throw new Error('fieldKey called on field without type');
  }
  return `${field.id}::${field.type}`;
}
