import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

export const createNodeSchema = z.object({
  parentId: objectIdSchema.nullable().optional().default(null),
  title: z.string().trim().min(1, 'Title is required').max(150),
  estimatedMinutes: z.number().min(0).optional().nullable(),
  order: z.number().optional(),
});

export const updateNodeSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'needs_revision']).optional(),
  estimatedMinutes: z.number().min(0).optional().nullable(),
  order: z.number().optional(),
});