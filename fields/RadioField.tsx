'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { RadioField as RadioFieldType } from '@/schemas/v1/fields';

type Props = {
  field: RadioFieldType;
  control: Control<FieldValues>;
};

export function RadioField({ field, control }: Props) {
  return (
    <div className="grid gap-2.5">
      <Label className="text-foreground/90">
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
        render={({ field: rhf }) => {
          const selected = rhf.value ?? '';
          return (
            <RadioGroup value={selected} onValueChange={rhf.onChange}>
              {field.options.map((opt) => {
                const isChecked = selected === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      isChecked
                        ? 'border-primary/50 bg-accent/60 text-foreground'
                        : 'border-border bg-card hover:bg-muted/60'
                    }`}
                  >
                    <RadioGroupItem value={opt.value} />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </RadioGroup>
          );
        }}
      />
    </div>
  );
}
