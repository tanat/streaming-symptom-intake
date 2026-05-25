'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NumberField as NumberFieldType } from '@/schemas/v1/fields';

type Props = {
  field: NumberFieldType;
  control: Control<FieldValues>;
};

export function NumberField({ field, control }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.id}>
        {field.label}
        {field.unit ? (
          <span className="ml-1 text-muted-foreground">({field.unit})</span>
        ) : null}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Controller
        name={field.id}
        control={control}
        defaultValue=""
        render={({ field: rhf }) => (
          <Input
            id={field.id}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={rhf.value ?? ''}
            onChange={(e) =>
              rhf.onChange(e.target.value === '' ? '' : Number(e.target.value))
            }
            onBlur={rhf.onBlur}
          />
        )}
      />
    </div>
  );
}
