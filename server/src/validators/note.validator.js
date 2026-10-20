import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

export const createNoteSchema = z.object({
  goalId: objectIdSchema.nullable().optional().default(null),
  nodeId: objectIdSchema.nullable().optional().default(null),
  title: z.string().trim().max(150).optional(),
  contentJSON: z.any().optional().default(null),
  contentText: z.string().optional().default(''),
  tags: z.array(z.string().trim()).optional().default([]),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{6})$/, 'Color must be a valid 6-digit hex code')
    .optional(),
});

// All fields optional for updates — autosave sends partial payloads
export const updateNoteSchema = z.object({
  title: z.string().trim().max(150).optional(),
  contentJSON: z.any().optional(),
  contentText: z.string().optional(),
  tags: z.array(z.string().trim()).optional(),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{6})$/, 'Color must be a valid 6-digit hex code')
    .optional(),
  // Explicitly allowed here, unlike goalId — a note can be re-linked to
  // a different topic, or unlinked entirely by passing null
  nodeId: objectIdSchema.nullable().optional(),
  baseUpdatedAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'baseUpdatedAt must be a valid date' })
    .optional(),
});