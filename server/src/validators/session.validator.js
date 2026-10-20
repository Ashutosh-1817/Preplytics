import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

export const startSessionSchema = z.object({
  nodeId: objectIdSchema,
  // true = close whatever session is already running, then start this one
  force: z.boolean().optional().default(false),
});

export const stopSessionSchema = z.object({
  sessionId: objectIdSchema,
  // Optional: stop the timer "as of" this moment (used by the idle check to
  // trim away the time nobody was studying). Clamped on the server.
  endedAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'endedAt must be a valid date' })
    .optional(),
});

export const manualSessionSchema = z.object({
  nodeId: objectIdSchema,
  durationMinutes: z.number().positive().max(1440, 'A single session cannot exceed 24 hours'),
  startedAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'startedAt must be a valid date' }),
});