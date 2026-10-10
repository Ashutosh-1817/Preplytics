// src/services/aiSyllabus.service.js
// FULL FILE: replace everything currently in this file with this.

import { generateCompletion } from './aiProvider.service.js';
import { chapterListSchema, topicListSchema } from '../validators/aiSyllabus.validator.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

const extractJson = (raw) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
};

// Returns validated data, or null when the provider answered but the
// content was unusable. Provider outages throw from generateCompletion.
const requestJson = async ({ system, user, maxTokens, schema }) => {
  const raw = await generateCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
        { temperature: 0.3, maxTokens, json: true }
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
const requestJsonWithRetry = async (args) => (await requestJson(args)) ?? (await requestJson(args));

const learnerContextLine = (context) =>
  context ? `\nAdditional context from the learner: ${context}` : '';

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

export const generateChapterTopics = async (subject, goalTitle, chapterTitle, siblingChapters, context) => {
  const others = siblingChapters.filter((t) => t !== chapterTitle);

  const system = `You are a curriculum planner breaking one chapter into study subtopics.

Preparation goal: "${goalTitle}"
Subject: "${subject}"
Chapter to break down: "${chapterTitle}"${
    others.length ? `\nOther chapters in this syllabus (do not duplicate their content): ${others.join('; ')}` : ''
  }${learnerContextLine(context)}

Respond with ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{ "subtopics": [ { "title": "Subtopic name", "estimatedMinutes": 60 } ] }

Rules:
- 2 to 8 subtopics, in a sensible learning order
- Depth and emphasis appropriate for "${goalTitle}"
- estimatedMinutes must be a realistic study time per subtopic (typically 30-180)
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

  return result;
};