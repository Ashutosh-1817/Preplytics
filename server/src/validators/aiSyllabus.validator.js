
import { z } from 'zod';

export const generateSyllabusSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(100),
  context: z.string().trim().max(300).optional().default(''),
});

export const expandChapterSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  chapterTitle: z.string().trim().min(1).max(150),
  siblingChapters: z.array(z.string().trim().max(150)).max(12).optional().default([]),
  context: z.string().trim().max(300).optional().default(''),
});

const subtopicSchema = z.object({
  title: z.string().trim().min(1).max(150),
  estimatedMinutes: z.number().positive().max(600),
});

const chapterSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subtopics: z.array(subtopicSchema).min(1).max(8),
});

// What the AI must return at each step, validated before we trust it
export const chapterListSchema = z.object({
  chapters: z.array(z.object({ title: z.string().trim().min(1).max(150) })).min(3).max(10),
});

export const topicListSchema = z.object({
  subtopics: z.array(subtopicSchema).min(2).max(8),
});

// What the frontend sends back after the user reviews the preview
export const bulkInsertSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  chapters: z.array(chapterSchema).min(1).max(10),
});