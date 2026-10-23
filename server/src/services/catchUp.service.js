// src/services/catchUp.service.js
// "Catch up": topics scheduled on past days that were never completed. PURE function,
// unit-tested in tests/catchup.test.js. The database reads live in the controller.
//
// Applying a catch-up reuses the scheduler's existing regenerateSchedule(): it marks
// old unfinished tasks as missed and spreads every incomplete topic over the days that
// are left, inside the daily limit. This file only PREVIEWS what that will do.

import { evaluateCapacity } from './scheduler.service.js';

const DEFAULT_LEAF_MINUTES = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dayStart = (date) => {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// tasks:           past, not-yet-completed tasks, each with a populated `nodeId` and lineage titles
// remainingMinutes: total time of every incomplete topic (what a regenerate would place again)
export const buildCatchUpPreview = ({ goal, tasks, remainingMinutes, today = new Date() }) => {
  if (!goal.targetDate) return { hasDeadline: false, missedCount: 0, missedMinutes: 0, missed: [] };

  const todayMs = dayStart(today);
  const byNode = new Map();

  for (const task of tasks) {
    const node = task.nodeId;
    if (!node || node.status === 'completed') continue;
    const dateMs = dayStart(task.scheduledDate);
    if (dateMs >= todayMs) continue;

    const key = String(node._id);
    const existing = byNode.get(key);
    if (existing && existing.dateMs <= dateMs) continue; // keep the earliest day a topic was missed

    byNode.set(key, {
      dateMs,
      item: {
        taskId: String(task._id),
        nodeId: key,
        title: node.title,
        subjectTitle: task.subjectTitle ?? null,
        chapterTitle: task.chapterTitle ?? null,
        scheduledDate: new Date(dateMs).toISOString().slice(0, 10),
        daysLate: Math.round((todayMs - dateMs) / MS_PER_DAY),
        minutes: Number(node.estimatedMinutes) || DEFAULT_LEAF_MINUTES,
      },
    });
  }

  const missed = [...byNode.values()].map((entry) => entry.item).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const evaluation = evaluateCapacity(goal, remainingMinutes);

  return {
    hasDeadline: true,
    missedCount: missed.length,
    missedMinutes: missed.reduce((sum, m) => sum + m.minutes, 0),
    missed,
    remainingMinutes,
    days: evaluation.days,
    dailyCapacityMinutes: evaluation.dailyCapacityMinutes,
    requiredDailyMinutes: evaluation.requiredDailyMinutes,
    maxDailyMinutes: evaluation.maxDailyMinutes,
    isOverCapacity: evaluation.isOverCapacity,
    exceedsHardLimit: evaluation.exceedsHardLimit,
  };
};