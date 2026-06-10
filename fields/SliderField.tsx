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
    <div className="grid gap-2.5">
      <Label htmlFor={field.id} className="text-foreground/90">
        <span>{field.label}</span>
        {field.unit ? (
          <span className="text-xs font-normal text-muted-foreground">
            {field.unit}
          </span>
        ) : null}
        {field.required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      <Controller
        name={field.id}
        control={control}
        defaultValue={field.min}
        render={({ field: rhf }) => {
          const current =
            typeof rhf.value === 'number' ? rhf.value : field.min;
          return (
            <div className="grid gap-2">
              <div className="flex items-center gap-3">
                <Slider
                  className="flex-1"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={[current]}
                  onValueChange={(v) =>
                    rhf.onChange(Array.isArray(v) ? v[0] : v)
                  }
                />
                <span className="min-w-14 rounded-md bg-muted px-2 py-0.5 text-center text-sm font-semibold tabular-nums text-foreground">
                  {current}
                  {field.unit ? ` ${field.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{field.min}</span>
                <span>{field.max}</span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
