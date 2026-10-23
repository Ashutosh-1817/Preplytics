import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ScheduledTask from '../models/ScheduledTask.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
  generateChapterList,
  generateChapterTopics,
  generateSubjectList,
  generateSubjectBreakdown,
} from '../services/aiSyllabus.service.js';
import { enforceAiRateLimit } from '../services/rateLimit.service.js';
import {
  generateSchedule,
  regenerateSchedule,
  assertCanSchedule,
  getCapacityInfo,
  MAX_DAILY_MINUTES,
} from '../services/scheduler.service.js';
import { planRoadmap } from '../services/estimation.service.js';
import { getOwnedGoalOrFail } from './goal.controller.js';

// ---------- Shared helpers ----------

const sumChapterMinutes = (chapters) =>
  chapters.reduce((sum, ch) => sum + ch.subtopics.reduce((s, sub) => s + sub.estimatedMinutes, 0), 0);

const buildEstimateMeta = (sub) =>
  typeof sub.baseMinutes === 'number'
    ? {
        baseMinutes: sub.baseMinutes,
        kind: sub.kind ?? undefined,
        priority: sub.priority ?? undefined,
        level: sub.level ?? undefined,
        ...(sub.locked === true && { locked: true }),
      }
    : undefined;

// Writes one subject with its chapters and subtopics.
// `order` is the subject's position among the goal's top-level nodes.
// Writes chapters and their subtopics under any existing parent node
const insertChapters = async (goal, parentNode, chapters) => {
  const insertedChapters = await RoadmapNode.insertMany(
    chapters.map((ch, i) => ({
      goalId: goal._id,
      parentId: parentNode._id,
      level: 2,
      title: ch.title,
      isActionable: false,
      order: i,
    }))
  );

  const subtopicDocs = [];
  chapters.forEach((ch, ci) => {
    const parentId = insertedChapters[ci]._id;
      ch.subtopics.forEach((sub, si) => {
      const estimateMeta = buildEstimateMeta(sub);
      subtopicDocs.push({
        goalId: goal._id,
        parentId,
        level: 3,
        title: sub.title,
        estimatedMinutes: sub.estimatedMinutes,
        ...(estimateMeta && { estimateMeta }),
        isActionable: true,
        order: si,
      });
    });
  });
  await RoadmapNode.insertMany(subtopicDocs);

  return { chapters: insertedChapters.length, subtopics: subtopicDocs.length };
};

// Writes one new subject with its chapters and subtopics.
// `order` is the subject's position among the goal's top-level nodes.
const insertSubjectTree = async (goal, title, chapters, order) => {
  const subjectNode = await RoadmapNode.create({
    goalId: goal._id,
    parentId: null,
    level: 1,
    title,
    isActionable: false,
    order,
  });

  return insertChapters(goal, subjectNode, chapters);
};

// The saved briefing's high-weight topics steer the generated syllabus
const withOverviewHint = (goal, context = '') => {
  const high = (goal.overview?.data?.keyTopics ?? []).filter((t) => t.weight === 'high').map((t) => t.topic);
  const hint = high.length ? `High-weight areas for this goal: ${high.join(', ')}` : '';
  return [context, hint].filter(Boolean).join('. ');
};

// A later syllabus must REGENERATE the schedule, not skip it
const syncSchedule = async (goal) => {
  if (!goal.targetDate) return { created: 0, isOverloaded: false };

  const existingScheduleCount = await ScheduledTask.countDocuments({ goalId: goal._id });
  return existingScheduleCount === 0 ? generateSchedule(goal) : regenerateSchedule(goal);
};

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

  const { subject, chapterTitle, siblingChapters, context, level } = req.body;
  const result = await generateChapterTopics(subject, goal.title, chapterTitle, siblingChapters, context, level);

  res.status(200).json(new ApiResponse(200, result, 'Chapter topics generated'));
});

// ---------- POST /goals/:goalId/ai-syllabus/subjects ----------

export const generateAiSubjects = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  await enforceAiRateLimit(req.user);

  const result = await generateSubjectList(goal.title, goal.description, withOverviewHint(goal, req.body.context));

  res.status(200).json(new ApiResponse(200, result, 'Subjects generated'));
});

// ---------- POST /goals/:goalId/ai-syllabus/subject-breakdown ----------

export const expandAiSubject = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  await enforceAiRateLimit(req.user);

  const { subject, siblingSubjects, context, level } = req.body;
  const result = await generateSubjectBreakdown(
    goal.title,
    subject,
    siblingSubjects,
    withOverviewHint(goal, context),
    level
  );

  res.status(200).json(new ApiResponse(200, result, 'Subject breakdown generated'));
});

// ---------- POST /goals/:goalId/ai-syllabus/estimate ----------
// Personalised time for a draft roadmap. Pure maths on what the client sends plus
// the goal's deadline, daily time and learned efficiency: NO AI call, so it is
// free to call on every level change and does not touch the daily AI limit.

export const estimateRoadmapTime = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { subjects, defaultLevel, restDaysPerWeek, subjectNodeId } = req.body;

  const capacity = await getCapacityInfo(goal);

  // Same rule the save endpoint applies: an empty subject that is about to receive
  // these topics stops being a leaf, so its own placeholder time is not "existing" work.
  let existingRemainingMinutes = capacity.existingRemainingMinutes;
  if (capacity.hasDeadline && subjectNodeId) {
    const subjectNode = await RoadmapNode.findOne({ _id: subjectNodeId, goalId: goal._id, level: 1 });
    if (subjectNode && subjectNode.isActionable && subjectNode.status !== 'completed') {
      existingRemainingMinutes = Math.max(0, existingRemainingMinutes - (subjectNode.estimatedMinutes || 30));
    }
  }

  const constraints = capacity.hasDeadline
    ? {
        daysLeft: capacity.days,
        dailyMinutes: goal.dailyAvailableMinutes,
        efficiencyRatio: goal.efficiencyRatio,
        restDaysPerWeek,
        existingRemainingMinutes,
        maxDailyMinutes: MAX_DAILY_MINUTES,
      }
    : null;

  const plan = planRoadmap({ subjects, defaultLevel, constraints });

  res.status(200).json(new ApiResponse(200, plan, 'Estimate calculated'));
});

// ---------- POST /goals/:goalId/bulk-nodes (one subject; unchanged behaviour) ----------

export const bulkInsertSyllabus = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { subject, chapters } = req.body;

  // Capacity pre-flight BEFORE any insert: if it throws, nothing was written
  await assertCanSchedule(goal, sumChapterMinutes(chapters));

  const order = await RoadmapNode.countDocuments({ goalId: goal._id, parentId: null });
  const created = await insertSubjectTree(goal, subject, chapters, order);

  const schedule = await syncSchedule(goal);

  res.status(201).json(
    new ApiResponse(
      201,
      { chaptersCreated: created.chapters, subtopicsCreated: created.subtopics, schedule },
      'Syllabus saved to roadmap'
    )
  );
});

// ---------- POST /goals/:goalId/bulk-subjects (whole roadmap) ----------

export const bulkInsertGoalSyllabus = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { subjects } = req.body;

  // One capacity check for the whole roadmap, before any insert
  const newMinutes = subjects.reduce((sum, s) => sum + sumChapterMinutes(s.chapters), 0);
  await assertCanSchedule(goal, newMinutes);

  const baseOrder = await RoadmapNode.countDocuments({ goalId: goal._id, parentId: null });

  let chaptersCreated = 0;
  let subtopicsCreated = 0;

  for (let i = 0; i < subjects.length; i++) {
    const created = await insertSubjectTree(goal, subjects[i].title, subjects[i].chapters, baseOrder + i);
    chaptersCreated += created.chapters;
    subtopicsCreated += created.subtopics;
  }

  // One schedule sync at the end, not one per subject
  const schedule = await syncSchedule(goal);

  res.status(201).json(
    new ApiResponse(
      201,
      { subjectsCreated: subjects.length, chaptersCreated, subtopicsCreated, schedule },
      'Roadmap saved'
    )
  );
});

// ---------- POST /goals/:goalId/nodes/:nodeId/roadmap ----------
// Saves the user-reviewed chapters + topics under an EXISTING top-level subject.

export const saveSubjectRoadmap = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  const subject = await RoadmapNode.findOne({ _id: req.params.nodeId, goalId: goal._id });
  if (!subject) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Subject not found');

  if (subject.level !== 1) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmaps can only be added to top-level subjects.');
  }

  const childCount = await RoadmapNode.countDocuments({ parentId: subject._id });
  if (childCount > 0) {
    throw new ApiError(409, ErrorCodes.VALIDATION_ERROR, 'This subject already has chapters.');
  }

  // The empty subject counts as one leaf in the capacity maths; it stops being one now
  const leafMinutes = subject.isActionable && subject.status !== 'completed' ? subject.estimatedMinutes || 30 : 0;
  const newMinutes = sumChapterMinutes(req.body.chapters) - leafMinutes;
  await assertCanSchedule(goal, newMinutes);

  const created = await insertChapters(goal, subject, req.body.chapters);

  await RoadmapNode.syncParentActionableStatus(subject._id);
  await ScheduledTask.deleteMany({ nodeId: subject._id, status: 'planned' });

  const schedule = await syncSchedule(goal);

  res.status(201).json(
    new ApiResponse(
      201,
      { chaptersCreated: created.chapters, subtopicsCreated: created.subtopics, schedule },
      'Subject roadmap saved'
    )
  );
});



export const saveSubjectList = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  const existing = await RoadmapNode.find({ goalId: goal._id, parentId: null }).select('title');
  const seen = new Set(existing.map((s) => s.title.trim().toLowerCase()));

  // Skip duplicates, both within the request and against subjects already on the goal
  const fresh = [];
  for (const { title } of req.body.subjects) {
    const key = title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(title.trim());
  }

  if (fresh.length === 0) {
    throw new ApiError(409, ErrorCodes.VALIDATION_ERROR, 'These subjects are already on your roadmap.');
  }

  await RoadmapNode.insertMany(
    fresh.map((title, i) => ({
      goalId: goal._id,
      parentId: null,
      level: 1,
      title,
      isActionable: false,
      order: existing.length + i,
    }))
  );

  res.status(201).json(
    new ApiResponse(
      201,
      { subjectsCreated: fresh.length, skipped: req.body.subjects.length - fresh.length },
      'Subjects saved'
    )
  );
});