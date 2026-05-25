import type { ComponentType } from 'react';
import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { RadioField } from './RadioField';
import { MultiselectField } from './MultiselectField';
import { SliderField } from './SliderField';
import { SeverityField } from './SeverityField';
import { DateField } from './DateField';
import { CheckboxField } from './CheckboxField';

export const FIELD_TYPES = [
  'text',
  'number',
  'radio',
  'multiselect',
  'slider',
  'severity',
  'date',
  'checkbox',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldRegistry: Record<FieldType, ComponentType<any>> = {
  text: TextField,
  number: NumberField,
  radio: RadioField,
  multiselect: MultiselectField,
  slider: SliderField,
  severity: SeverityField,
  date: DateField,
  checkbox: CheckboxField,
};
