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
import { SkeletonSection } from './FormSkeleton';

type Props = {
  spec: DeepPartial<FormSpecType> | undefined;
  /** Presentation hint: show a trailing skeleton while the stream runs. */
  isStreaming?: boolean;
};

export function FormRenderer({ spec, isStreaming = false }: Props) {
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

  const sectionList = sections ?? [];
  const renderedSomething =
    Boolean(triage?.suspectedCategory) ||
    Boolean(triage?.urgency) ||
    flags.length > 0 ||
    sectionList.length > 0;

  return (
    <FormProvider {...methods}>
      <form className="grid gap-5">
        <RedFlagBanner
          category={triage?.suspectedCategory}
          urgency={triage?.urgency}
          redFlags={flags}
        />

        {sectionList.map((section, sIdx) => {
          if (!section) return null;
          const sectionKey = section.id ?? `section_${sIdx}`;
          return (
            <section
              key={sectionKey}
              className="animate-intake-rise grid gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-sm ring-1 ring-foreground/[0.03] transition-shadow"
            >
              <SectionHeader
                title={section.title}
                description={section.description}
              />
              {section.title ? (
                <div className="h-px bg-gradient-to-r from-border to-transparent" />
              ) : null}
              <div className="grid gap-5">
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
                    <div key={key} className="animate-intake-rise">
                      <FieldErrorBoundary fieldId={safe.id}>
                        <Cmp field={safe} control={methods.control} />
                      </FieldErrorBoundary>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Trailing placeholder while the model is still streaming the
            rest of the form in. Purely visual. */}
        {isStreaming ? (
          renderedSomething ? (
            <SkeletonSection fields={2} />
          ) : null
        ) : null}
      </form>
    </FormProvider>
  );
}

// Re-export schema for convenience in case callers want it.
export { FormSpec };
