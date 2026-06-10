'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { MultiselectField as MultiselectFieldType } from '@/schemas/v1/fields';

type Props = {
  field: MultiselectFieldType;
  control: Control<FieldValues>;
};

export function MultiselectField({ field, control }: Props) {
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
        defaultValue={[]}
        render={({ field: rhf }) => {
          const values: string[] = Array.isArray(rhf.value) ? rhf.value : [];
          return (
            <div className="grid gap-2">
              {field.options.map((opt) => {
                const checked = values.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-primary/50 bg-accent/60 text-foreground'
                        : 'border-border bg-card hover:bg-muted/60'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        const isChecked = next === true;
                        const nextValues = isChecked
                          ? [...values, opt.value]
                          : values.filter((v) => v !== opt.value);
                        rhf.onChange(nextValues);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          );
        }}
      />
    </div>
  );
}
