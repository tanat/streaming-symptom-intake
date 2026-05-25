'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DateField as DateFieldType } from '@/schemas/v1/fields';

type Props = {
  field: DateFieldType;
  control: Control<FieldValues>;
};

export function DateField({ field, control }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Controller
        name={field.id}
        control={control}
        defaultValue=""
        render={({ field: rhf }) => (
          <Input
            id={field.id}
            type="date"
            min={field.min}
            max={field.max}
            value={rhf.value ?? ''}
            onChange={rhf.onChange}
            onBlur={rhf.onBlur}
          />
        )}
      />
    </div>
  );
}
