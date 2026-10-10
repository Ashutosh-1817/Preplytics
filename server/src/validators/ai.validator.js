

import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

export const askAiSchema = z.object({
  action: z.enum(['chat', 'summarize', 'explain', 'generate_notes', 'generate_quiz']),
  contextType: z.enum(['note', 'node', 'file', 'none']).default('none'),
  contextId: objectIdSchema.nullable().optional().default(null),
  contextPage: z.number().int().min(1).max(10000).nullable().optional().default(null),
  message: z.string().trim().max(2000).optional().default(''),
  conversationId: objectIdSchema.nullable().optional().default(null),
});

export const saveAsNoteSchema = z.object({
  content: z.string().trim().min(1, 'Content is required'),
  contentJSON: z.any().optional().default(null),
  title: z.string().trim().max(150).optional(),
  goalId: objectIdSchema.nullable().optional().default(null),
  nodeId: objectIdSchema.nullable().optional().default(null),
});