import { z } from 'zod';
import mongoose from 'mongoose';
import { ANNOTATION_COLORS, ANNOTATION_TYPES } from '../models/Annotation.model.js';

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid id format');

const fraction = z.number().min(0).max(1);

const rectSchema = z.object({
  x: fraction,
  y: fraction,
  w: fraction.refine((v) => v > 0, 'Width must be above 0'),
  h: fraction.refine((v) => v > 0, 'Height must be above 0'),
});

export const listAnnotationsSchema = z.object({
  fileId: objectIdSchema,
});

export const createAnnotationSchema = z.object({
  fileId: objectIdSchema,
  page: z.number().int().min(1).max(10000),
  type: z.enum(ANNOTATION_TYPES),
  color: z.enum(ANNOTATION_COLORS).optional().default('yellow'),
  rects: z.array(rectSchema).min(1).max(200),
  quote: z.string().max(3000).optional().default(''),
  comment: z.string().trim().max(2000).optional().default(''),
});

export const updateAnnotationSchema = z.object({
  color: z.enum(ANNOTATION_COLORS).optional(),
  comment: z.string().trim().max(2000).optional(),
});