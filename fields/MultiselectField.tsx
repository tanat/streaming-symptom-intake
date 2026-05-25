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
    <div className="grid gap-2">
      <Label>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
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
                    className="flex items-center gap-2 text-sm"
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
