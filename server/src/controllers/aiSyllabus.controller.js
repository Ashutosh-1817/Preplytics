
import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { generateChapterList, generateChapterTopics } from '../services/aiSyllabus.service.js';
import { enforceAiRateLimit } from '../services/rateLimit.service.js';
import { generateSchedule, regenerateSchedule, assertCanSchedule } from '../services/scheduler.service.js';
import { getOwnedGoalOrFail } from './goal.controller.js';

// ---------- POST /goals/:goalId/ai-syllabus/chapters ----------

export const generateAiChapters = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  await enforceAiRateLimit(req.user);

  const { subject, context } = req.body;
  const result = await generateChapterList(subject, goal.title, context);

  res.status(200).json(new ApiResponse(200, result, 'Chapters generated'));
});

// ---------- POST /goals/:goalId/ai-syllabus/expand ----------

export const expandAiChapter = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  await enforceAiRateLimit(req.user);

  const { subject, chapterTitle, siblingChapters, context } = req.body;
  const result = await generateChapterTopics(subject, goal.title, chapterTitle, siblingChapters, context);

  res.status(200).json(new ApiResponse(200, result, 'Chapter topics generated'));
});

// ---------- POST /goals/:goalId/bulk-nodes ----------

export const bulkInsertSyllabus = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { subject, chapters } = req.body;

  // Capacity pre-flight BEFORE any insert. Existing remaining work plus
  // this syllabus must not need more than the daily limit. If it does,
  // this throws a 400 and nothing has been written.
  const newMinutes = chapters.reduce(
    (sum, ch) => sum + ch.subtopics.reduce((s, sub) => s + sub.estimatedMinutes, 0),
    0
  );
  await assertCanSchedule(goal, newMinutes);

  const orderCounter = await RoadmapNode.countDocuments({ goalId: goal._id, parentId: null });

  const subjectNode = await RoadmapNode.create({
    goalId: goal._id,
    parentId: null,
    level: 1,
    title: subject,
    isActionable: false,
    order: orderCounter,
  });

  const chapterDocs = chapters.map((ch, i) => ({
    goalId: goal._id,
    parentId: subjectNode._id,
    level: 2,
    title: ch.title,
    isActionable: false,
    order: i,
  }));
  const insertedChapters = await RoadmapNode.insertMany(chapterDocs);

  const subtopicDocs = [];
  chapters.forEach((ch, ci) => {
    const parentId = insertedChapters[ci]._id;
    ch.subtopics.forEach((sub, si) => {
      subtopicDocs.push({
        goalId: goal._id,
        parentId,
        level: 3,
        title: sub.title,
        estimatedMinutes: sub.estimatedMinutes,
        isActionable: true,
        order: si,
      });
    });
  });
  await RoadmapNode.insertMany(subtopicDocs);

  // A later subject must REGENERATE the schedule, not skip it
  let scheduleResult = { created: 0, isOverloaded: false };

  if (goal.targetDate) {
    const ScheduledTask = (await import('../models/ScheduledTask.model.js')).default;
    const existingScheduleCount = await ScheduledTask.countDocuments({ goalId: goal._id });

    scheduleResult = existingScheduleCount === 0
      ? await generateSchedule(goal)
      : await regenerateSchedule(goal);
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        chaptersCreated: insertedChapters.length,
        subtopicsCreated: subtopicDocs.length,
        schedule: scheduleResult,
      },
      'Syllabus saved to roadmap'
    )
  );
});