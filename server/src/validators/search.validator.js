

import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

export const runSearchSchema = z.object({
  query: z.string().trim().min(2, 'Enter at least 2 characters').max(300, 'Keep the search under 300 characters'),
  depth: z.enum(['basic', 'advanced']).default('basic'),
  topic: z.enum(['general', 'news']).default('general'),
  timeRange: z.enum(['any', 'day', 'week', 'month', 'year']).default('any'),
  goalId: objectIdSchema.nullable().optional().default(null),
  fresh: z.boolean().optional().default(false),
});

export const summarizeSchema = z.object({
  regenerate: z.boolean().optional().default(false),
});