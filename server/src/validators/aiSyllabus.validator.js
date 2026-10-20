
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

// ---------- Goal-level generation (Phase 1) ----------

export const generateSubjectsSchema = z.object({
  context: z.string().trim().max(300).optional().default(''),
});

export const expandSubjectSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  siblingSubjects: z.array(z.string().trim().max(100)).max(10).optional().default([]),
  context: z.string().trim().max(300).optional().default(''),
});

// What the AI must return, validated before we trust it
export const subjectListSchema = z.object({
  subjects: z.array(z.object({ title: z.string().trim().min(1).max(100) })).min(2).max(8),
});

export const subjectBreakdownSchema = z.object({
  chapters: z.array(chapterSchema).min(2).max(8),
});

// What the frontend sends back after the user reviews the whole roadmap
export const bulkInsertGoalSchema = z.object({
  subjects: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(100),
        chapters: z.array(chapterSchema).min(1).max(8),
      })
    )
    .min(1)
    .max(8),
});

// What the AI must return at each step, validated before we trust it
export const chapterListSchema = z.object({
  chapters: z.array(z.object({ title: z.string().trim().min(1).max(150) })).min(3).max(10),
});

export const topicListSchema = z.object({
  subtopics: z.array(subtopicSchema).min(2).max(8),
});


export const bulkInsertSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  chapters: z.array(chapterSchema).min(1).max(10),
});

export const saveSubjectRoadmapSchema = z.object({
  chapters: z.array(chapterSchema).min(1).max(10),
});


export const saveSubjectListSchema = z.object({
  subjects: z.array(z.object({ title: z.string().trim().min(1).max(100) })).min(1).max(12),
});