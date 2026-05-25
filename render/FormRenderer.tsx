'use client';

import { useForm, FormProvider, type FieldValues } from 'react-hook-form';
import { useMemo } from 'react';
import type { DeepPartial } from 'ai';
import {
  FormSpec,
  type FormSpec as FormSpecType,
} from '@/schemas/v1/form-spec';
import { FieldDescriptor } from '@/schemas/v1/fields';
import { fieldRegistry } from '@/fields/registry';
import { isFieldRenderable } from '@/fields/__helpers__/is-renderable';
import { fieldKey } from '@/fields/__helpers__/stable-key';
import { SectionHeader } from './SectionHeader';
import { RedFlagBanner } from './RedFlagBanner';
import { FieldErrorBoundary } from './ErrorBoundary';

type Props = {
  spec: DeepPartial<FormSpecType> | undefined;
};

export function FormRenderer({ spec }: Props) {
  const methods = useForm<FieldValues>({ shouldUnregister: false });

  const triage = spec?.triageContext;
  const sections = spec?.sections;

  const flags = useMemo(
    () =>
      (triage?.redFlags ?? []).filter(
        (f): f is string => typeof f === 'string' && f.length > 0,
      ),
    [triage?.redFlags],
  );

  if (!spec) return null;

  return (
    <FormProvider {...methods}>
      <form className="grid gap-6">
        <RedFlagBanner
          category={triage?.suspectedCategory}
          urgency={triage?.urgency}
          redFlags={flags}
        />

        {(sections ?? []).map((section, sIdx) => {
          if (!section) return null;
          const sectionKey = section.id ?? `section_${sIdx}`;
          return (
            <section
              key={sectionKey}
              className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm"
            >
              <SectionHeader
                title={section.title}
                description={section.description}
              />
              <div className="grid gap-4">
                {(section.fields ?? []).map((field) => {
                  // Render-gate: only mount fields with the minimum
                  // props for their type.
                  if (!isFieldRenderable(field)) return null;

                  // Belt-and-suspenders: validate against the schema
                  // before mounting. Cheap and catches anything the
                  // hand-written guard might miss.
                  const parsed = FieldDescriptor.safeParse(field);
                  if (!parsed.success) return null;
                  const safe = parsed.data;

                  const Cmp =
                    fieldRegistry[safe.type as keyof typeof fieldRegistry];
                  if (!Cmp) return null;

                  // Composite key — type-flip => clean unmount/remount.
                  const key = fieldKey(safe);

                  return (
                    <FieldErrorBoundary key={key} fieldId={safe.id}>
                      <Cmp field={safe} control={methods.control} />
                    </FieldErrorBoundary>
                  );
                })}
              </div>
            </section>
          );
        })}
      </form>
    </FormProvider>
  );
}

// Re-export schema for convenience in case callers want it.
export { FormSpec };
