'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { SeverityField as SeverityFieldType } from '@/schemas/v1/fields';

type Props = {
  field: SeverityFieldType;
  control: Control<FieldValues>;
};

export function SeverityField({ field, control }: Props) {
  const max = field.scale ?? 10;
  return (
    <div className="grid gap-2">
      <Label htmlFor={field.id}>
        {field.label}
        <span className="ml-1 text-muted-foreground">(0–{max})</span>
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Controller
        name={field.id}
        control={control}
        defaultValue={0}
        render={({ field: rhf }) => {
          const current = typeof rhf.value === 'number' ? rhf.value : 0;
          return (
            <div className="grid gap-1">
              <Slider
                min={0}
                max={max}
                step={1}
                value={[current]}
                onValueChange={(v) =>
                  rhf.onChange(Array.isArray(v) ? v[0] : v)
                }
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (none)</span>
                <span className="font-medium text-foreground">{current}</span>
                <span>{max} (worst)</span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
