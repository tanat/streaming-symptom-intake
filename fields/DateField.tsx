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
    <div className="grid gap-2">
      <Label htmlFor={field.id} className="text-foreground/90">
        <span>{field.label}</span>
        {field.required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
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
