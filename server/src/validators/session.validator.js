import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

export const startSessionSchema = z.object({
  nodeId: objectIdSchema,
});

export const stopSessionSchema = z.object({
  sessionId: objectIdSchema,
});

export const manualSessionSchema = z.object({
  nodeId: objectIdSchema,
  durationMinutes: z.number().positive().max(1440, 'A single session cannot exceed 24 hours'),
  startedAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'startedAt must be a valid date' }),
});