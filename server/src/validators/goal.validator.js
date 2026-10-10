
import { z } from 'zod';

export const createGoalSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100),
  description: z.string().trim().max(500).optional().default(''),
  targetDate: z
    .string()
    .datetime({ message: 'targetDate must be a valid ISO date' })
    .optional()
    .nullable(),
  hasQuestionBank: z.boolean().optional().default(false),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{6})$/, 'Color must be a valid 6-digit hex code')
    .optional(),
  // Was missing, so zod silently stripped it and it was never saved
  dailyAvailableMinutes: z
    .number()
    .int()
    .min(15, 'Daily study time must be at least 15 minutes')
    .max(1440)
    .optional(),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
  status: z.enum(['active', 'completed', 'archived']).optional(),
});