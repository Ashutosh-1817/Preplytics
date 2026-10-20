import { z } from 'zod';

export const generateOverviewSchema = z.object({
  regenerate: z.boolean().optional().default(false),
});

const line = (max) => z.string().trim().min(1).max(max);

// What the AI must return, validated before we trust or store it
export const overviewSchema = z.object({
  summary: line(600),
  certainty: z.enum(['high', 'medium', 'low']).catch('low'),
  examPattern: z.array(line(240)).max(8).default([]),
  eligibility: z.array(line(240)).max(6).default([]),
  keyTopics: z
    .array(
      z.object({
        topic: line(100),
        weight: z.enum(['high', 'medium', 'low']).catch('medium'),
        note: z.string().trim().max(200).optional().default(''),
      })
    )
    .min(3)
    .max(10),
  strategyTips: z.array(line(260)).min(2).max(7),
});