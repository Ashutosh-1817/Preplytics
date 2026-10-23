import { z } from 'zod';
import { LEVELS } from '../config/estimation.config.js';

export const relevelSchema = z.object({
  level: z.enum(LEVELS),
  // 'fit' squeezes to the deadline, 'comfortable' keeps the full personalised time
  mode: z.enum(['fit', 'comfortable']).optional().default('fit'),
});