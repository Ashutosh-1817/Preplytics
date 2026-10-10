import { z } from 'zod';

export const updateTaskStatusSchema = z.object({
  status: z.enum(['planned', 'completed', 'missed', 'pushed']),
});

export const calendarQuerySchema = z.object({
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'startDate must be a valid date string',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'endDate must be a valid date string',
  }),
});