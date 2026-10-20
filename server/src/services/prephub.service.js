import mongoose from 'mongoose';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ScheduledTask from '../models/ScheduledTask.model.js';
import Session from '../models/Session.model.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { getOwnedGoalOrFail } from '../controllers/goal.controller.js';
import { localDateKey } from '../utils/localDate.js';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a._id).localeCompare(String(b._id));

// Every actionable topic of the goal, in the order the roadmap reads
const flattenLeaves = (nodes) => {
  const childrenOf = new Map();
  for (const n of nodes) {
    const key = n.parentId ? String(n.parentId) : 'root';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(n);
  }

  const out = [];
  const walk = (key) => {
    for (const n of (childrenOf.get(key) ?? []).sort(byOrder)) {
      const id = String(n._id);
      if (childrenOf.get(id)?.length) walk(id);
      else if (n.isActionable) out.push(n);
    }
  };
  walk('root');
  return out;
};

const brief = (n) => (n ? { _id: n._id, title: n.title, status: n.status } : null);

// Everything the PrepHub header, breadcrumb and topic panel need, in one request.
// Notes and files are loaded separately through their existing endpoints.
export const getPrepHub = async (userId, nodeId, tz) => {
  if (!mongoose.Types.ObjectId.isValid(nodeId)) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Topic not found');
  }

  const node = await RoadmapNode.findById(nodeId).lean();
  if (!node) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Topic not found');

  // 404 (not 403) when the goal belongs to someone else
  const goal = await getOwnedGoalOrFail(node.goalId, userId);

  const allNodes = await RoadmapNode.find({ goalId: node.goalId })
    .select('title level parentId order isActionable status')
    .lean();
  const byId = new Map(allNodes.map((n) => [String(n._id), n]));

  // Subject > Chapter > ... (the topic itself is not included)
  const breadcrumb = [];
  let cursor = node.parentId ? byId.get(String(node.parentId)) : null;
  for (let guard = 0; cursor && guard < 6; guard += 1) {
    breadcrumb.unshift({ _id: cursor._id, title: cursor.title, level: cursor.level });
    cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
  }

  const leaves = flattenLeaves(allNodes);
  const index = leaves.findIndex((n) => String(n._id) === String(node._id));

  const todayKey = localDateKey(new Date(), tz);
  const finished = { owner: userId, nodeId: node._id, durationMinutes: { $ne: null } };

  const [task, sessionCount, lastSession] = await Promise.all([
    ScheduledTask.findOne({ owner: userId, nodeId: node._id, status: 'planned' })
      .sort({ scheduledDate: 1 })
      .select('scheduledDate')
      .lean(),
    Session.countDocuments(finished),
    Session.findOne(finished).sort({ endedAt: -1 }).select('endedAt').lean(),
  ]);

  // scheduledDate is a UTC-midnight calendar day: read it as a date, not an instant
  const taskKey = task ? task.scheduledDate.toISOString().slice(0, 10) : null;

  return {
    node: {
      _id: node._id,
      goalId: node.goalId,
      parentId: node.parentId,
      title: node.title,
      level: node.level,
      status: node.status,
      isActionable: node.isActionable,
      estimatedMinutes: node.estimatedMinutes ?? null,
      actualMinutesSpent: node.actualMinutesSpent ?? 0,
    },
    goal: {
      _id: goal._id,
      title: goal.title,
      color: goal.color,
      targetDate: goal.targetDate,
      status: goal.status,
    },
    breadcrumb,
    position: index === -1 ? null : { index: index + 1, total: leaves.length },
    prev: index > 0 ? brief(leaves[index - 1]) : null,
    next: index !== -1 && index < leaves.length - 1 ? brief(leaves[index + 1]) : null,
    schedule: taskKey ? { date: taskKey, overdue: taskKey < todayKey } : null,
    stats: {
      sessionCount,
      lastStudiedAt: lastSession?.endedAt ?? null,
    },
  };
};