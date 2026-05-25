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
    <div className="grid gap-2">
      <Label>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Controller
        name={field.id}
        control={control}
        defaultValue=""
        render={({ field: rhf }) => (
          <RadioGroup value={rhf.value ?? ''} onValueChange={rhf.onChange}>
            {field.options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-sm"
              >
                <RadioGroupItem value={opt.value} />
                <span>{opt.label}</span>
              </label>
            ))}
          </RadioGroup>
        )}
      />
    </div>
  );
}
