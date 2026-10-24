
import ScheduledTask from '../models/ScheduledTask.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { getOwnedGoalOrFail } from './goal.controller.js';
import { generateSchedule, regenerateSchedule, getCapacityInfo } from '../services/scheduler.service.js';
import { syncNodeFromTaskStatus } from '../services/statusSync.service.js';
import dateOnly, { addDays } from '../utils/dateOnly.js';
import { buildCatchUpPreview } from '../services/catchUp.service.js';

// Walks each task's leaf node up to its chapter and subject, attaching
// readable breadcrumb titles. Parent lookups are batched.
const attachLineage = async (tasks) => {
  const parentIds = [
    ...new Set(
      tasks
        .map((t) => t.nodeId?.parentId)
        .filter(Boolean)
        .map((id) => id.toString())
    ),
  ];

  const chapters = await RoadmapNode.find({ _id: { $in: parentIds } }).select('title level parentId');
  const chapterMap = new Map(chapters.map((c) => [c._id.toString(), c]));

  const grandparentIds = [
    ...new Set(chapters.map((c) => c.parentId).filter(Boolean).map((id) => id.toString())),
  ];
  const subjects = await RoadmapNode.find({ _id: { $in: grandparentIds } }).select('title');
  const subjectMap = new Map(subjects.map((s) => [s._id.toString(), s]));

  return tasks.map((task) => {
    const taskObj = task.toObject();
    const chapter = taskObj.nodeId?.parentId ? chapterMap.get(taskObj.nodeId.parentId.toString()) : null;
    const subject = chapter?.parentId ? subjectMap.get(chapter.parentId.toString()) : null;

    return {
      ...taskObj,
      chapterTitle: chapter?.title || null,
      subjectTitle: subject?.title || null,
    };
  });
};

// ---------- POST /goals/:goalId/schedule/generate ----------

export const generateGoalSchedule = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  const existingCount = await ScheduledTask.countDocuments({ goalId: goal._id });
  if (existingCount > 0) {
    throw new ApiError(
      400,
      ErrorCodes.VALIDATION_ERROR,
      'Schedule already exists for this goal — use /schedule/regenerate instead'
    );
  }

  const result = await generateSchedule(goal);

  res.status(201).json(new ApiResponse(201, result, 'Schedule generated successfully'));
});

// ---------- POST /goals/:goalId/schedule/regenerate ----------

export const regenerateGoalSchedule = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  const result = await regenerateSchedule(goal);

  res.status(200).json(new ApiResponse(200, result, 'Schedule regenerated successfully'));
});

// ---------- GET /goals/:goalId/schedule/capacity ----------

export const getGoalCapacity = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const info = await getCapacityInfo(goal);

  res.status(200).json(new ApiResponse(200, info, 'Capacity fetched successfully'));
});

     // ---------- GET /goals/:goalId/schedule/catch-up ----------
     // Topics scheduled on past days that were never completed, and what rescheduling
     // them (POST /schedule/regenerate) would mean for the days that are left. Writes nothing.

export const getCatchUp = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  if (!goal.targetDate) {
    return res.status(200).json(new ApiResponse(200, buildCatchUpPreview({ goal, tasks: [], remainingMinutes: 0 }), 'Catch-up fetched'));
  }

  const tasks = await ScheduledTask.find({
    goalId: goal._id,
    scheduledDate: { $lt: dateOnly(new Date()) },
    status: { $in: ['planned', 'missed', 'pushed'] },
  })
    .populate('nodeId', 'title level parentId estimatedMinutes status')
    .sort({ scheduledDate: 1 });

  // Topics that already have a planned task today or later were rescheduled (Catch up),
  // so they are no longer "missed"
  const upcoming = await ScheduledTask.find({
    goalId: goal._id,
    scheduledDate: { $gte: dateOnly(new Date()) },
    status: 'planned',
  }).select('nodeId');
  const rescheduledNodeIds = new Set(upcoming.map((t) => String(t.nodeId)));

  const withLineage = await attachLineage(tasks.filter((t) => t.nodeId));
  const capacity = await getCapacityInfo(goal);

  const preview = buildCatchUpPreview({
    goal,
    tasks: withLineage,
    remainingMinutes: capacity.existingRemainingMinutes,
    rescheduledNodeIds,
  });

  res.status(200).json(new ApiResponse(200, preview, 'Catch-up fetched'));
});

// ---------- GET /goals/:goalId/schedule/calendar ----------

export const getGoalCalendar = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { startDate, endDate } = req.query;

  const tasks = await ScheduledTask.find({
    goalId: goal._id,
    scheduledDate: { $gte: dateOnly(startDate), $lte: dateOnly(endDate) },
  })
    .populate('nodeId', 'title level parentId estimatedMinutes status actualMinutesSpent')
    .sort({ scheduledDate: 1 });

  const withLineage = await attachLineage(tasks);

  res.status(200).json(new ApiResponse(200, { tasks: withLineage }, 'Calendar fetched successfully'));
});

// ---------- GET /tasks/today ----------

export const getTodayTasks = asyncHandler(async (req, res) => {
  const today = dateOnly(new Date());
  const tomorrow = addDays(today, 1);

  const tasks = await ScheduledTask.find({
    owner: req.user._id,
    scheduledDate: { $gte: today, $lt: tomorrow },
  })
    .populate('nodeId', 'title level parentId estimatedMinutes status actualMinutesSpent')
    .populate('goalId', 'title color')
    .sort({ createdAt: 1 });

  const withLineage = await attachLineage(tasks);

  res.status(200).json(new ApiResponse(200, { tasks: withLineage }, "Today's tasks fetched successfully"));
});

// ---------- PATCH /tasks/:taskId/status ----------

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await ScheduledTask.findOne({ _id: req.params.taskId, owner: req.user._id });

  if (!task) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Scheduled task not found');
  }

       // Past days are view-only: what happened there is history. Unfinished topics are
     // rescheduled with "Catch up", or finished from the roadmap / PrepHub (which also
     // closes their old tasks).
  if (dateOnly(task.scheduledDate).getTime() < dateOnly(new Date()).getTime()) {
       throw new ApiError(
         409,
         ErrorCodes.VALIDATION_ERROR,
         'Past days are view-only. Use Catch up to reschedule missed topics, or mark the topic complete from your roadmap.'
       );
  }

  task.status = req.body.status;
  await task.save();

  await syncNodeFromTaskStatus(task);

  res.status(200).json(new ApiResponse(200, { task }, 'Task status updated successfully'));
});