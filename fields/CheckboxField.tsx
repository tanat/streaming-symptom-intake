'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CheckboxField as CheckboxFieldType } from '@/schemas/v1/fields';

type Props = {
  field: CheckboxFieldType;
  control: Control<FieldValues>;
};

export function CheckboxField({ field, control }: Props) {
  return (
    <div className="grid gap-1.5">
      <Controller
        name={field.id}
        control={control}
        defaultValue={false}
        render={({ field: rhf }) => {
          const checked = rhf.value === true;
          return (
            <label
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                checked
                  ? 'border-primary/50 bg-accent/60 text-foreground'
                  : 'border-border bg-card hover:bg-muted/60'
              }`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => rhf.onChange(next === true)}
              />
              <span>
                {field.label}
                {field.required ? (
                  <span className="text-destructive" aria-hidden>
                    {' '}
                    *
                  </span>
                ) : null}
              </span>
            </label>
          );
        }}
      />
    </div>
  );
}
