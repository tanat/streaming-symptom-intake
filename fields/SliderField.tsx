'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { SliderField as SliderFieldType } from '@/schemas/v1/fields';

type Props = {
  field: SliderFieldType;
  control: Control<FieldValues>;
};

export function SliderField({ field, control }: Props) {
  return (
    <div className="grid gap-2">
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
        defaultValue={field.min}
        render={({ field: rhf }) => {
          const current =
            typeof rhf.value === 'number' ? rhf.value : field.min;
          return (
            <div className="grid gap-1">
              <Slider
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={[current]}
                onValueChange={(v) =>
                  rhf.onChange(Array.isArray(v) ? v[0] : v)
                }
              />
              <div className="text-xs text-muted-foreground">
                {current}
                {field.unit ? ` ${field.unit}` : ''}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
