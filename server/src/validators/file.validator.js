

import { z } from 'zod';
import mongoose from 'mongoose';
import { MAX_FILE_BYTES } from '../utils/fileType.js';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

const optionalId = objectIdSchema.nullable().optional().default(null);

export const signatureRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1, 'Unsupported file type'),
  fileSize: z
    .number()
    .positive('This file is empty')
    .max(MAX_FILE_BYTES, 'File size cannot exceed 10MB'),
});

export const confirmUploadSchema = z.object({
  cloudinaryPublicId: z.string().trim().min(1).max(300),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1),
  goalId: optionalId,
  nodeId: optionalId,
  noteId: optionalId,
});