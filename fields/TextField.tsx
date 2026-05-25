'use client';

import { Controller, type Control, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TextField as TextFieldType } from '@/schemas/v1/fields';

type Props = {
  field: TextFieldType;
  control: Control<FieldValues>;
};

export function TextField({ field, control }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Controller
        name={field.id}
        control={control}
        defaultValue=""
        render={({ field: rhf }) => (
          <Input
            id={field.id}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            value={rhf.value ?? ''}
            onChange={rhf.onChange}
            onBlur={rhf.onBlur}
          />
        )}
      />
    </div>
  );
}
