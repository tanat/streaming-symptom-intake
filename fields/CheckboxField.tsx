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
        render={({ field: rhf }) => (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={rhf.value === true}
              onCheckedChange={(next) => rhf.onChange(next === true)}
            />
            <span>
              {field.label}
              {field.required ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </span>
          </label>
        )}
      />
    </div>
  );
}
