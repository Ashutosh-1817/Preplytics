// src/services/relevel.service.js
// Re-levelling a SAVED subject or chapter: "I know Graphs better now". PURE functions
// only (no database, no clock), so every rule is unit-tested in tests/relevel.test.js.
//
// The rules (agreed with the learner):
//   - nothing is ever removed: a topic is either rescaled or left exactly as it is
//   - completed topics, topics already studied (in progress, revisit, or any logged
//     time) and topics whose time the learner typed (locked) are left alone
//   - an older topic with no stored metadata is rescaled from its CURRENT time,
//     treated as its standard time
//   - the deadline squeeze works exactly as it does when a roadmap is first made

import { planTopics, normalizeBaseMinutes } from './estimation.service.js';
import { DEFAULT_KIND, DEFAULT_PRIORITY } from '../config/estimation.config.js';

const DEFAULT_LEAF_MINUTES = 30; // what the scheduler assumes when a topic has no estimate

export const minutesOfLeaf = (leaf) => Number(leaf.estimatedMinutes) || DEFAULT_LEAF_MINUTES;

// Why a topic is left alone, or null when it can be rescaled
export const skipReason = (leaf) => {
  if (leaf.status === 'completed') return 'completed';
  if (leaf.status === 'in_progress' || leaf.status === 'needs_revision' || Number(leaf.actualMinutesSpent) > 0) {
    return 'already_studied';
  }
  if (leaf.estimateMeta?.locked) return 'locked';
  return null;
};

const baseOf = (leaf) => leaf.estimateMeta?.baseMinutes ?? normalizeBaseMinutes(minutesOfLeaf(leaf));

// leaves:      [{ _id, title, chapterTitle?, status, estimatedMinutes, actualMinutesSpent, estimateMeta? }]
// level:       the new familiarity level
// mode:        'fit' (squeeze to the deadline) | 'comfortable' (full personalised time)
// constraints: as planTopics(), with existingRemainingMinutes EXCLUDING the rescalable leaves
//              (null when the goal has no deadline)
export const planRelevel = ({ leaves, level, mode = 'fit', constraints = null }) => {
  const reasons = leaves.map(skipReason);
  const eligible = leaves.filter((_, i) => reasons[i] === null);

  const plan = planTopics({
    topics: eligible.map((leaf) => ({
      baseMinutes: baseOf(leaf),
      kind: leaf.estimateMeta?.kind ?? DEFAULT_KIND,
      priority: leaf.estimateMeta?.priority ?? DEFAULT_PRIORITY,
      level,
    })),
    defaultLevel: level,
    constraints,
  });

  let cursor = 0;
  const items = leaves.map((leaf, i) => {
    const before = minutesOfLeaf(leaf);
    const base = {
      nodeId: String(leaf._id),
      title: leaf.title,
      chapterTitle: leaf.chapterTitle ?? null,
      status: leaf.status,
      before,
    };

    if (reasons[i]) return { ...base, action: 'skip', reason: reasons[i], after: before, comfortable: before };

    const planned = plan.topics[cursor++];
    return {
      ...base,
      action: 'rescale',
      reason: null,
      after: mode === 'comfortable' ? planned.comfortableMinutes : planned.fittedMinutes,
      comfortable: planned.comfortableMinutes,
      compressed: mode === 'comfortable' ? false : planned.compressed,
      meta: { baseMinutes: planned.baseMinutes, kind: planned.kind, priority: planned.priority, level },
    };
  });

  const rescaled = items.filter((it) => it.action === 'rescale');
  const sum = (list, key) => list.reduce((total, it) => total + it[key], 0);

  return {
    items,
    totals: {
      rescaledCount: rescaled.length,
      skippedCount: items.length - rescaled.length,
      rescaledBefore: sum(rescaled, 'before'),
      rescaledAfter: sum(rescaled, 'after'),
      changedCount: rescaled.filter((it) => it.after !== it.before).length,
    },
    summary: plan.summary,
  };
};

// How the topic times were set before, e.g. { rusty: 3, unknown: 2 }
export const countCurrentLevels = (leaves) => {
  const counts = {};
  for (const leaf of leaves) {
    const key = leaf.estimateMeta?.level ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

// What to write to the database for the rescaled topics
export const toNodeUpdates = (items) =>
  items
    .filter((it) => it.action === 'rescale')
    .map((it) => ({ nodeId: it.nodeId, estimatedMinutes: it.after, estimateMeta: it.meta }));