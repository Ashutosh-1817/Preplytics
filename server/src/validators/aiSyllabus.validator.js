
import { z } from 'zod';
import {
  LEVELS,
  DEFAULT_LEVEL,
  KINDS,
  DEFAULT_KIND,
  PRIORITIES,
  DEFAULT_PRIORITY,
  MIN_TOPIC_MINUTES,
  MAX_BASE_MINUTES,
} from '../config/estimation.config.js';
import { normalizeBaseMinutes } from '../services/estimation.service.js';

// Learner familiarity. Optional everywhere: omitted means "heard of it" (neutral).
const levelSchema = z.enum(LEVELS);
const levelWithDefault = levelSchema.optional().default(DEFAULT_LEVEL);

export const generateSyllabusSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(100),
  context: z.string().trim().max(300).optional().default(''),
});

export const expandChapterSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  chapterTitle: z.string().trim().min(1).max(150),
  siblingChapters: z.array(z.string().trim().max(150)).max(12).optional().default([]),
  context: z.string().trim().max(300).optional().default(''),
  level: levelWithDefault,
});

// A topic as the client saves it. The metadata is optional so older clients keep working.
const subtopicSchema = z.object({
  title: z.string().trim().min(1).max(150),
  estimatedMinutes: z.number().positive().max(600),
  baseMinutes: z.number().min(MIN_TOPIC_MINUTES).max(MAX_BASE_MINUTES).nullish(),
  kind: z.enum(KINDS).nullish(),
  priority: z.enum(PRIORITIES).nullish(),
  level: levelSchema.nullish(),
     locked: z.boolean().nullish(),
});

const chapterSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subtopics: z.array(subtopicSchema).min(1).max(8),
});

// A topic as the AI returns it. Deliberately forgiving: a missing or odd value
// is repaired instead of rejected, because a rejection costs a retry (AI quota).
// An older-style `estimatedMinutes` is accepted when `baseMinutes` is absent.
const aiSubtopicSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    baseMinutes: z.unknown().optional(),
    estimatedMinutes: z.unknown().optional(),
    kind: z.enum(KINDS).optional().catch(undefined),
    priority: z.enum(PRIORITIES).optional().catch(undefined),
  })
  .transform((topic) => ({
    title: topic.title,
    baseMinutes: normalizeBaseMinutes(topic.baseMinutes, topic.estimatedMinutes),
    kind: topic.kind ?? DEFAULT_KIND,
    priority: topic.priority ?? DEFAULT_PRIORITY,
  }));

const aiChapterSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subtopics: z.array(aiSubtopicSchema).min(1).max(8),
});

// ---------- Goal-level generation (Phase 1) ----------

export const generateSubjectsSchema = z.object({
  context: z.string().trim().max(300).optional().default(''),
});

export const expandSubjectSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  siblingSubjects: z.array(z.string().trim().max(100)).max(10).optional().default([]),
  context: z.string().trim().max(300).optional().default(''),
  level: levelWithDefault,
});

// What the AI must return, validated before we trust it
export const subjectListSchema = z.object({
  subjects: z.array(z.object({ title: z.string().trim().min(1).max(100) })).min(2).max(8),
});

export const subjectBreakdownSchema = z.object({
  chapters: z.array(aiChapterSchema).min(2).max(8),
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
  subtopics: z.array(aiSubtopicSchema).min(2).max(8),
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

// ---------- Personalised time estimate (no AI call) ----------

const estimateTopicSchema = z.object({
  title: z.string().trim().min(1).max(150),
  baseMinutes: z.number().min(MIN_TOPIC_MINUTES).max(MAX_BASE_MINUTES),
  kind: z.enum(KINDS).optional().default(DEFAULT_KIND),
  priority: z.enum(PRIORITIES).optional().default(DEFAULT_PRIORITY),
  level: levelSchema.optional(),
  // Set when the learner typed their own time for this topic; never rescaled
  lockedMinutes: z.number().positive().max(600).optional(),
});

const estimateChapterSchema = z.object({
  title: z.string().trim().min(1).max(150),
  level: levelSchema.optional(),
  subtopics: z.array(estimateTopicSchema).min(1).max(12),
});

const estimateSubjectSchema = z.object({
  title: z.string().trim().min(1).max(100),
  level: levelSchema.optional(),
  chapters: z.array(estimateChapterSchema).min(1).max(10),
});

const MAX_ESTIMATE_TOPICS = 400;

export const estimateTimeSchema = z
  .object({
    subjects: z.array(estimateSubjectSchema).min(1).max(12),
    defaultLevel: levelWithDefault,
    restDaysPerWeek: z.number().int().min(0).max(6).optional().default(0),
    subjectNodeId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid subject id').optional(),
  })
  .refine(
    ({ subjects }) =>
      subjects.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.subtopics.length, 0), 0) <= MAX_ESTIMATE_TOPICS,
    { message: `Too many topics in one request (max ${MAX_ESTIMATE_TOPICS})` }
  );