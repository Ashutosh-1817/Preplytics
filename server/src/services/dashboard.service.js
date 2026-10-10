import mongoose from 'mongoose';
import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import Session from '../models/Session.model.js';
import dateOnly, { addDays } from '../utils/dateOnly.js';

const HEATMAP_DAYS = 365;
const STREAK_LOOKBACK_CAP = 365;

// ---------- Completion % per goal ----------

export const getOverview = async (userId) => {
  const goals = await Goal.find({ owner: userId, status: 'active' });

  const goalStats = await Promise.all(
    goals.map(async (goal) => {
      const [totalActionable, completedActionable] = await Promise.all([
        RoadmapNode.countDocuments({ goalId: goal._id, isActionable: true }),
        RoadmapNode.countDocuments({ goalId: goal._id, isActionable: true, status: 'completed' }),
      ]);

      // Explicit guard — a goal with no actionable nodes yet shows as
      // null, not 0%, so the frontend can distinguish "no roadmap built
      // yet" from "roadmap built, zero progress"
      const completionPercent =
        totalActionable === 0 ? null : Math.round((completedActionable / totalActionable) * 100);

      return {
        goalId: goal._id,
        title: goal.title,
        color: goal.color,
        totalActionable,
        targetDate: goal.targetDate,
        completedActionable,
        completionPercent,
        isOverloaded: goal.isOverloaded,
        efficiencyRatio: goal.efficiencyRatio,
      };
    })
  );

  return { goals: goalStats };
};

// ---------- Time-spent heatmap ----------

export const getHeatmap = async (userId, goalId = null) => {
  const today = dateOnly(new Date());
  const windowStart = addDays(today, -(HEATMAP_DAYS - 1));

   const filter = {
    owner: new mongoose.Types.ObjectId(userId),
    startedAt: { $gte: windowStart },
    durationMinutes: { $ne: null },
  };
  if (goalId) filter.goalId = new mongoose.Types.ObjectId(goalId);

  const results = await Session.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
        minutes: { $sum: '$durationMinutes' },
      },
    },
  ]);

  const minutesByDate = new Map(results.map((r) => [r._id, r.minutes]));

  // Build the full 365-day array regardless of data sparsity — every
  // day present, zero-filled where nothing was logged
  const heatmap = [];
  for (let i = 0; i < HEATMAP_DAYS; i++) {
    const day = addDays(windowStart, i);
    const key = day.toISOString().slice(0, 10);
    heatmap.push({ date: key, minutes: minutesByDate.get(key) || 0 });
  }

  return heatmap;
};

// ---------- Streaks ----------

export const getStreak = async (userId) => {
  const today = dateOnly(new Date());

  // Pull every distinct day (cross-goal) this user logged at least one
  // session, within the lookback cap, as a fast lookup set
  const windowStart = addDays(today, -STREAK_LOOKBACK_CAP);

  const sessions = await Session.find({
    owner: userId,
    startedAt: { $gte: windowStart },
    durationMinutes: { $ne: null },
  }).select('startedAt');

  const activeDays = new Set(sessions.map((s) => dateOnly(s.startedAt).toISOString().slice(0, 10)));

  const dayKey = (d) => d.toISOString().slice(0, 10);

  // Current streak: walk backward from today; if today has no session,
  // check yesterday instead (streak "alive but not extended yet" case)
  let currentStreak = 0;
  let cursor = today;

  if (!activeDays.has(dayKey(today))) {
    cursor = addDays(today, -1);
  }

  for (let i = 0; i < STREAK_LOOKBACK_CAP; i++) {
    if (activeDays.has(dayKey(cursor))) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  // Longest streak ever: walk the full lookback window once, tracking
  // the longest run of consecutive active days encountered
  let longestStreak = 0;
  let runLength = 0;
  let walker = addDays(today, -STREAK_LOOKBACK_CAP);

  for (let i = 0; i <= STREAK_LOOKBACK_CAP; i++) {
    if (activeDays.has(dayKey(walker))) {
      runLength += 1;
      longestStreak = Math.max(longestStreak, runLength);
    } else {
      runLength = 0;
    }
    walker = addDays(walker, 1);
  }

  return { currentStreak, longestStreak };
};