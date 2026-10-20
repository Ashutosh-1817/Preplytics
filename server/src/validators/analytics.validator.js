import { z } from 'zod';
import { isValidTimeZone } from '../utils/localDate.js';

const ALLOWED_RANGES = [7, 30, 90, 365];

export const analyticsQuerySchema = z.object({
  goalId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid goal id').optional(),
  range: z.coerce
    .number()
    .int()
    .refine((v) => ALLOWED_RANGES.includes(v), 'range must be 7, 30, 90 or 365')
    .default(30),
  tz: z.string().max(64).refine(isValidTimeZone, 'Invalid time zone').default('UTC'),
});