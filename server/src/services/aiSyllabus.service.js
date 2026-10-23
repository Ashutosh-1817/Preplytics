
import { generateCompletion } from './aiProvider.service.js';
import {
  chapterListSchema,
  topicListSchema,
  subjectListSchema,
  subjectBreakdownSchema,
} from '../validators/aiSyllabus.validator.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { DEFAULT_LEVEL } from '../config/estimation.config.js';
import { personalizeTopic } from './estimation.service.js';

const extractJson = (raw) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
};

// Returns validated data, or null when the provider answered but the
// content was unusable. Provider outages throw from generateCompletion.
const requestJson = async ({ system, user, maxTokens, schema, timeoutMs }) => {
  const raw = await generateCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.3, maxTokens, json: true, ...(timeoutMs && { timeoutMs }) }
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }

  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
};

// One retry, only for unusable content. Safe now that each call is small.
export const requestJsonWithRetry = async (args) => (await requestJson(args)) ?? (await requestJson(args));

const learnerContextLine = (context) =>
  context ? `\nAdditional context from the learner: ${context}` : '';

// The topic list must be identical for every learner. How long each topic takes
// THEM is worked out afterwards by the server, never by the model.
const TOPIC_FIELD_RULES = `- Cover EVERY topic a student needs for this part of the syllabus, including the basics. The list must be complete and the same for any learner, whatever they already know
- baseMinutes: how long an average beginner needs to understand the topic AND do basic practice on it. A multiple of 5, between 15 and 180
- kind: exactly one of "concept" (understanding ideas), "practice" (solving problems, coding, numericals) or "memorize" (facts, formulas, definitions)
- priority: exactly one of "core" (high-yield for the goal), "important", or "optional" (nice to have, low-yield)`;

// ---------- Step 1: chapter titles only ----------

export const generateChapterList = async (subject, goalTitle, context) => {
  const system = `You are a curriculum planner creating a study syllabus outline for a specific preparation goal.

Preparation goal: "${goalTitle}"
Subject: "${subject}"${learnerContextLine(context)}

List the main chapters (units) of this subject, chosen and ordered for "${goalTitle}". Prioritize what actually matters for that goal rather than a generic textbook treatment.

Respond with ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{ "chapters": [ { "title": "Chapter name" } ] }

Rules:
- 4 to 10 chapters
- Foundational chapters first, in a sensible learning sequence
- Titles only: no subtopics, no numbering, no descriptions
- Do not include anything outside the JSON object`;

  const result = await requestJsonWithRetry({
    system,
    user: `List the chapters of "${subject}" for the goal "${goalTitle}".`,
    maxTokens: 1000, // headroom: some free models spend part of the budget reasoning
    schema: chapterListSchema,
  });

  if (!result) {
    throw new ApiError(
      502,
      ErrorCodes.INTERNAL_SERVER_ERROR,
      'Could not generate the chapter list. Please try again or enter topics manually.'
    );
  }

  return result;
};

// ---------- Step 2: subtopics for ONE chapter ----------

export const generateChapterTopics = async (
  subject,
  goalTitle,
  chapterTitle,
  siblingChapters,
  context,
  level = DEFAULT_LEVEL
) => {
  const others = siblingChapters.filter((t) => t !== chapterTitle);

  const system = `You are a curriculum planner breaking one chapter into study subtopics.

Preparation goal: "${goalTitle}"
Subject: "${subject}"
Chapter to break down: "${chapterTitle}"${
    others.length ? `\nOther chapters in this syllabus (do not duplicate their content): ${others.join('; ')}` : ''
  }${learnerContextLine(context)}

Respond with ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{ "subtopics": [ { "title": "Subtopic name", "baseMinutes": 60, "kind": "concept", "priority": "core" } ] }

Rules:
- 2 to 8 subtopics, in a sensible learning order
- Depth and emphasis appropriate for "${goalTitle}"
${TOPIC_FIELD_RULES}
- Do not include anything outside the JSON object`;

  const result = await requestJsonWithRetry({
    system,
    user: `Break down the chapter "${chapterTitle}" of "${subject}" for the goal "${goalTitle}".`,
    maxTokens: 1200,
    schema: topicListSchema,
  });

  if (!result) {
    throw new ApiError(
      502,
      ErrorCodes.INTERNAL_SERVER_ERROR,
      'Could not generate topics for this chapter. Please retry.'
    );
  }

  return { subtopics: result.subtopics.map((topic) => personalizeTopic(topic, level)) };
};

// ---------- Goal-level, step 1: core subjects ----------

export const generateSubjectList = async (goalTitle, goalDescription, context) => {
  const system = `You are a curriculum planner. A learner is starting this preparation goal.

Goal: "${goalTitle}"${goalDescription ? `\nGoal description: ${goalDescription}` : ''}${learnerContextLine(context)}

List the core subjects that must be covered to prepare for this goal, in a sensible study order, weighted by what actually matters for it.

Respond with ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{ "subjects": [ { "title": "Subject name" } ] }

Rules:
- 3 to 8 subjects: fewer for a narrow goal, more for a broad exam
- Titles only, short (under 6 words), no numbering, no descriptions
- Foundational subjects first
- Do not include anything outside the JSON object`;

  const result = await requestJsonWithRetry({
    system,
    user: `List the core subjects for the goal "${goalTitle}".`,
    maxTokens: 1000,
    schema: subjectListSchema,
  });

  if (!result) {
    throw new ApiError(
      502,
      ErrorCodes.INTERNAL_SERVER_ERROR,
      'Could not generate the subject list. Please try again or build your roadmap manually.'
    );
  }

  return result;
};

// ---------- Goal-level, step 2: chapters and topics for ONE subject ----------

export const generateSubjectBreakdown = async (goalTitle, subject, siblingSubjects, context, level = DEFAULT_LEVEL) => {
  const others = siblingSubjects.filter((t) => t !== subject);

  const system = `You are a curriculum planner breaking one subject into chapters and study topics.

Preparation goal: "${goalTitle}"
Subject to break down: "${subject}"${
    others.length ? `\nOther subjects in this syllabus (do not duplicate their content): ${others.join('; ')}` : ''
  }${learnerContextLine(context)}

Respond with ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{ "chapters": [ { "title": "Chapter name", "subtopics": [ { "title": "Topic name", "baseMinutes": 60, "kind": "concept", "priority": "core" } ] } ] }

Rules:
- 3 to 7 chapters in a sensible learning order
- 3 to 6 subtopics per chapter
- Depth and emphasis appropriate for "${goalTitle}"
${TOPIC_FIELD_RULES}
- Do not include anything outside the JSON object`;

  const result = await requestJsonWithRetry({
    system,
    user: `Break down "${subject}" for the goal "${goalTitle}".`,
    maxTokens: 3000,
    timeoutMs: 40_000,
    schema: subjectBreakdownSchema,
  });

  if (!result) {
    throw new ApiError(
      502,
      ErrorCodes.INTERNAL_SERVER_ERROR,
      'Could not generate topics for this subject. Please retry.'
    );
  }

  return {
    chapters: result.chapters.map((chapter) => ({
      title: chapter.title,
      subtopics: chapter.subtopics.map((topic) => personalizeTopic(topic, level)),
    })),
  };
};