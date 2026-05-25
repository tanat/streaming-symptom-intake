import { z } from 'zod';

export const TriageContext = z.object({
  suspectedCategory: z.string().optional(),
  urgency: z.enum(['routine', 'urgent', 'emergent']).optional(),
  redFlags: z.array(z.string()).optional(),
});

export type TriageContext = z.infer<typeof TriageContext>;
