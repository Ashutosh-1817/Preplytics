import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { getOwnedGoalOrFail } from './goal.controller.js';
import { assertCanSchedule, getCapacityInfo, regenerateSchedule, MAX_DAILY_MINUTES } from '../services/scheduler.service.js';
import { planRelevel, skipReason, minutesOfLeaf, countCurrentLevels, toNodeUpdates } from '../services/relevel.service.js';

// The topics (leaves) a subject / chapter / topic is made of, with their chapter's title
const loadLeaves = async (goal, nodeId) => {
  const node = await RoadmapNode.findOne({ _id: nodeId, goalId: goal._id });
  if (!node) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap item not found');

  if (node.level === 1 && node.isActionable) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'This subject has no topics yet. Generate its roadmap first.');
  }

  let leaves;
  if (node.isActionable) {
    leaves = [node];
  } else {
    const ids = await RoadmapNode.findDescendantIds(node._id);
    leaves = await RoadmapNode.find({ _id: { $in: ids }, isActionable: true });
  }

  if (leaves.length === 0) throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'There are no topics here to change.');

  const parentIds = [...new Set(leaves.map((l) => l.parentId).filter(Boolean).map(String))];
  const parents = parentIds.length ? await RoadmapNode.find({ _id: { $in: parentIds } }).select('title') : [];
  const titleOf = new Map(parents.map((p) => [String(p._id), p.title]));

  const plain = leaves.map((leaf) => {
    const o = typeof leaf.toObject === 'function' ? leaf.toObject() : leaf;
    return { ...o, chapterTitle: leaf.parentId ? titleOf.get(String(leaf.parentId)) ?? null : null };
  });
  plain.sort((a, b) => String(a.chapterTitle).localeCompare(String(b.chapterTitle)) || (a.order ?? 0) - (b.order ?? 0));

  return { node, leaves: plain };
};

// The same plan the preview shows, computed fresh on the server (client numbers are never trusted)
const buildPlan = async (goal, leaves, { level, mode }) => {
  const capacity = await getCapacityInfo(goal);

  const eligibleBefore = leaves.filter((l) => skipReason(l) === null).reduce((sum, l) => sum + minutesOfLeaf(l), 0);
  const constraints = capacity.hasDeadline
    ? {
        daysLeft: capacity.days,
        dailyMinutes: goal.dailyAvailableMinutes,
        efficiencyRatio: goal.efficiencyRatio,
        existingRemainingMinutes: Math.max(0, capacity.existingRemainingMinutes - eligibleBefore),
        maxDailyMinutes: MAX_DAILY_MINUTES,
      }
    : null;

  return planRelevel({ leaves, level, mode, constraints });
};

// ---------- POST /goals/:goalId/nodes/:nodeId/relevel/preview ----------
// Shows what would change. Writes nothing.

export const previewRelevel = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { level, mode } = req.body;

  const { node, leaves } = await loadLeaves(goal, req.params.nodeId);
  const plan = await buildPlan(goal, leaves, { level, mode });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        target: { nodeId: String(node._id), title: node.title, level: node.level },
        level,
        mode,
        currentLevels: countCurrentLevels(leaves),
        ...plan,
      },
      'Preview calculated'
    )
  );
});

// ---------- POST /goals/:goalId/nodes/:nodeId/relevel ----------
// Applies it, then rebuilds the schedule (only the learner's confirmation reaches here).

export const applyRelevel = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { level, mode } = req.body;

  const { leaves } = await loadLeaves(goal, req.params.nodeId);
  const plan = await buildPlan(goal, leaves, { level, mode });

  // Capacity pre-flight BEFORE any write: if it throws, nothing was changed
  await assertCanSchedule(goal, plan.totals.rescaledAfter - plan.totals.rescaledBefore);

  const updates = toNodeUpdates(plan.items);
  if (updates.length > 0) {
    await RoadmapNode.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u.nodeId, goalId: goal._id },
          update: { $set: { estimatedMinutes: u.estimatedMinutes, estimateMeta: u.estimateMeta } },
        },
      }))
    );
  }

  const schedule = goal.targetDate ? await regenerateSchedule(goal) : null;

  res.status(200).json(
    new ApiResponse(
      200,
      { updated: updates.length, skipped: plan.totals.skippedCount, totals: plan.totals, schedule },
      'Study levels updated'
    )
  );
});