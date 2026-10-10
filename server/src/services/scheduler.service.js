
import RoadmapNode from '../models/RoadmapNode.model.js';
import ScheduledTask from '../models/ScheduledTask.model.js';
import buildTree from '../utils/buildTree.js';
import dateOnly, { addDays } from '../utils/dateOnly.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { getAdjustedDailyMinutes } from './efficiency.service.js';

const DEFAULT_ESTIMATED_MINUTES = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// No schedule is ever built that needs more than this per day
export const MAX_DAILY_MINUTES = 8 * 60;

const minutesOf = (node) => node.estimatedMinutes || DEFAULT_ESTIMATED_MINUTES;
const sumMinutes = (nodes) => nodes.reduce((sum, n) => sum + minutesOf(n), 0);

const formatDurationLabel = (minutes) => {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// ---------- Gathering the work to schedule ----------

const flattenActionableIncomplete = (tree) => {
  const result = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        walk(node.children);
      } else if (node.isActionable && node.status !== 'completed') {
        result.push(node);
      }
    }
  };
  walk(tree);
  return result;
};

// Round-robin across subjects so days mix subjects instead of finishing
// one subject entirely before the next appears.
const interleaveQueues = (queues) => {
  const result = [];
  const cursors = queues.map(() => 0);
  let remaining = queues.reduce((sum, q) => sum + q.length, 0);

  while (remaining > 0) {
    for (let i = 0; i < queues.length; i++) {
      if (cursors[i] < queues[i].length) {
        result.push(queues[i][cursors[i]]);
        cursors[i] += 1;
        remaining -= 1;
      }
    }
  }

  return result;
};

// Single source of truth for "what still needs scheduling", used by the
// scheduler, the capacity endpoint and the pre-save check alike.
const collectScheduleNodes = async (goalId) => {
  const allNodes = await RoadmapNode.find({ goalId });
  const tree = buildTree(allNodes);
  const perSubjectQueues = tree.map((subjectNode) => flattenActionableIncomplete([subjectNode]));
  return interleaveQueues(perSubjectQueues);
};

// ---------- Capacity ----------

// Days from today to the deadline, inclusive. Never less than 1.
export const daysUntil = (targetDate) => {
  const today = dateOnly(new Date());
  const diff = Math.floor((dateOnly(targetDate).getTime() - today.getTime()) / MS_PER_DAY);
  return Math.max(1, diff + 1);
};

export const evaluateCapacity = (goal, totalMinutes) => {
  const days = daysUntil(goal.targetDate);
  const dailyCapacityMinutes = getAdjustedDailyMinutes(goal);
  const availableMinutes = days * dailyCapacityMinutes;
  const requiredDailyMinutes = Math.ceil(totalMinutes / days);

  return {
    days,
    dailyCapacityMinutes,
    availableMinutes,
    totalMinutes,
    requiredDailyMinutes,
    maxDailyMinutes: MAX_DAILY_MINUTES,
    isOverCapacity: totalMinutes > availableMinutes,
    exceedsHardLimit: requiredDailyMinutes > MAX_DAILY_MINUTES,
  };
};

const assertWithinHardLimit = (goal, evaluation) => {
  if (!evaluation.exceedsHardLimit) return;

  const dueLabel = dateOnly(goal.targetDate).toISOString().slice(0, 10);

  throw new ApiError(
    400,
    ErrorCodes.SCHEDULE_OVER_CAPACITY,
    `Finishing ${formatDurationLabel(evaluation.totalMinutes)} of study by ${dueLabel} would take about ` +
      `${formatDurationLabel(evaluation.requiredDailyMinutes)} every day, above the ` +
      `${MAX_DAILY_MINUTES / 60}-hour daily limit. Remove some topics or extend your deadline.`,
    evaluation
  );
};

// Pre-flight check with no side effects. Call BEFORE any destructive or
// insert step, so a refused request leaves everything untouched.
export const assertCanSchedule = async (goal, extraMinutes = 0) => {
  if (!goal.targetDate) return;

  const leaves = await collectScheduleNodes(goal._id);
  assertWithinHardLimit(goal, evaluateCapacity(goal, sumMinutes(leaves) + extraMinutes));
};

// What the syllabus preview modal needs to run its live capacity check
export const getCapacityInfo = async (goal) => {
  if (!goal.targetDate) {
    return { hasDeadline: false, maxDailyMinutes: MAX_DAILY_MINUTES };
  }

  const leaves = await collectScheduleNodes(goal._id);
  const evaluation = evaluateCapacity(goal, sumMinutes(leaves));

  return {
    hasDeadline: true,
    targetDate: goal.targetDate,
    days: evaluation.days,
    dailyCapacityMinutes: evaluation.dailyCapacityMinutes,
    efficiencyRatio: goal.efficiencyRatio,
    existingRemainingMinutes: evaluation.totalMinutes,
    maxDailyMinutes: MAX_DAILY_MINUTES,
  };
};

// ---------- Distribution ----------

// Each node is placed on the day its midpoint falls into along a
// cumulative-minutes timeline, with a per-day budget of
// max(daily capacity, total / days):
//   - work fits: budget = your daily time, so it front-loads
//   - work doesn't fit: budget = exactly what's needed, so the load is
//     spread evenly and lands on the deadline
// A midpoint is always below the total, so the index can never run past
// the last day. Nothing is ever piled onto the deadline.
const distributeAcrossDays = (nodes, startDate, totalDays, dailyCapacityMinutes) => {
  const total = sumMinutes(nodes);
  const budget = Math.max(dailyCapacityMinutes, total / totalDays);

  let cumulative = 0;

  return nodes.map((node) => {
    const minutes = minutesOf(node);
    const midpoint = cumulative + minutes / 2;
    cumulative += minutes;

    const dayIndex = Math.min(totalDays - 1, Math.floor(midpoint / budget));

    return { nodeId: node._id, scheduledDate: addDays(startDate, dayIndex) };
  });
};

// ---------- Public service functions ----------

export const generateSchedule = async (goal) => {
  const incompleteLeaves = await collectScheduleNodes(goal._id);

  if (!goal.targetDate || incompleteLeaves.length === 0) {
    return { created: 0, isOverloaded: false };
  }

  const evaluation = evaluateCapacity(goal, sumMinutes(incompleteLeaves));
  assertWithinHardLimit(goal, evaluation);

  const today = dateOnly(new Date());

  // Never insert a node/date pair that already has a task of any status
  const existingTasks = await ScheduledTask.find({ goalId: goal._id });
  const existingKeySet = new Set(
    existingTasks.map((t) => `${t.nodeId.toString()}_${dateOnly(t.scheduledDate).getTime()}`)
  );

  const assignments = distributeAcrossDays(
    incompleteLeaves,
    today,
    evaluation.days,
    evaluation.dailyCapacityMinutes
  );

  const docs = assignments
    .filter((a) => !existingKeySet.has(`${a.nodeId.toString()}_${a.scheduledDate.getTime()}`))
    .map((a) => ({
      owner: goal.owner,
      goalId: goal._id,
      nodeId: a.nodeId,
      scheduledDate: a.scheduledDate,
      status: 'planned',
    }));

  if (docs.length > 0) {
    await ScheduledTask.insertMany(docs, { ordered: false });
  }

  goal.isOverloaded = evaluation.isOverCapacity;
  await goal.save();

  return {
    created: docs.length,
    isOverloaded: evaluation.isOverCapacity,
    requiredDailyMinutes: evaluation.requiredDailyMinutes,
    dailyCapacityMinutes: evaluation.dailyCapacityMinutes,
    days: evaluation.days,
  };
};

export const regenerateSchedule = async (goal) => {
  // Validate FIRST. A refused regeneration must leave the existing
  // schedule exactly as it was, so this runs before anything is deleted.
  await assertCanSchedule(goal);

  const today = dateOnly(new Date());

  // Unacted-on tasks from past days become 'missed'
  await ScheduledTask.updateMany(
    { goalId: goal._id, scheduledDate: { $lt: today }, status: 'planned' },
    { $set: { status: 'missed' } }
  );

  // Clear only future, still-planned tasks
  await ScheduledTask.deleteMany({
    goalId: goal._id,
    scheduledDate: { $gte: today },
    status: 'planned',
  });

  return generateSchedule(goal);
};