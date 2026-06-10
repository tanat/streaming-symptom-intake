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
  const max = 10; // fixed 1–10 severity scale (no longer model-controlled)
  return (
    <div className="grid gap-2.5">
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
        defaultValue={0}
        render={({ field: rhf }) => {
          const current = typeof rhf.value === 'number' ? rhf.value : 0;
          const ratio = max > 0 ? current / max : 0;
          const tone =
            current === 0
              ? 'bg-muted text-muted-foreground'
              : ratio < 0.4
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                : ratio < 0.7
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200';
          return (
            <div className="grid gap-2">
              <div className="flex items-center gap-3">
                <Slider
                  className="flex-1"
                  min={0}
                  max={max}
                  step={1}
                  value={[current]}
                  onValueChange={(v) =>
                    rhf.onChange(Array.isArray(v) ? v[0] : v)
                  }
                />
                <span
                  className={`min-w-12 rounded-md px-2 py-0.5 text-center text-sm font-semibold tabular-nums ${tone}`}
                >
                  {current}/{max}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>No pain</span>
                <span>Worst imaginable</span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
