import { z } from 'zod';
import { FieldDescriptor } from './fields';
import { TriageContext } from './triage';

export const SCHEMA_VERSION = 'v1.0.0' as const;

export const Section = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(FieldDescriptor),
});

export type Section = z.infer<typeof Section>;

export const FormSpec = z.object({
  triageContext: TriageContext,
  sections: z.array(Section).min(1),
});

export type FormSpec = z.infer<typeof FormSpec>;

export { TriageContext } from './triage';
export { FieldDescriptor } from './fields';
