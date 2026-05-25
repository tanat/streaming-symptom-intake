import { z } from 'zod';

const Base = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
});

export const TextFieldSchema = Base.extend({
  type: z.literal('text'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const NumberFieldSchema = Base.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  step: z.number().optional(),
});

export const RadioFieldSchema = Base.extend({
  type: z.literal('radio'),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(2),
});

export const MultiselectFieldSchema = Base.extend({
  type: z.literal('multiselect'),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(2),
});

export const SliderFieldSchema = Base.extend({
  type: z.literal('slider'),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  unit: z.string().optional(),
});

export const SeverityFieldSchema = Base.extend({
  type: z.literal('severity'),
  scale: z.literal(10).optional(),
});

export const DateFieldSchema = Base.extend({
  type: z.literal('date'),
  min: z.string().optional(),
  max: z.string().optional(),
});

export const CheckboxFieldSchema = Base.extend({
  type: z.literal('checkbox'),
});

export const FieldDescriptor = z.discriminatedUnion('type', [
  TextFieldSchema,
  NumberFieldSchema,
  RadioFieldSchema,
  MultiselectFieldSchema,
  SliderFieldSchema,
  SeverityFieldSchema,
  DateFieldSchema,
  CheckboxFieldSchema,
]);

export type FieldDescriptor = z.infer<typeof FieldDescriptor>;
export type TextField = z.infer<typeof TextFieldSchema>;
export type NumberField = z.infer<typeof NumberFieldSchema>;
export type RadioField = z.infer<typeof RadioFieldSchema>;
export type MultiselectField = z.infer<typeof MultiselectFieldSchema>;
export type SliderField = z.infer<typeof SliderFieldSchema>;
export type SeverityField = z.infer<typeof SeverityFieldSchema>;
export type DateField = z.infer<typeof DateFieldSchema>;
export type CheckboxField = z.infer<typeof CheckboxFieldSchema>;
