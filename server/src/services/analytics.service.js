import mongoose from 'mongoose';
import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ScheduledTask from '../models/ScheduledTask.model.js';
import Session from '../models/Session.model.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { getAdjustedDailyMinutes } from './efficiency.service.js';
import { localDateKey, addDaysToKey, daysBetweenKeys, keysBetween, keyToUtcDate } from '../utils/localDate.js';

const { ObjectId } = mongoose.Types;
const NODES = RoadmapNode.collection.name;

// Must match DEFAULT_ESTIMATED_MINUTES in scheduler.service.js
const DEFAULT_ESTIMATED_MINUTES = 30;
const STREAK_LOOKBACK_DAYS = 730;
const MAX_BURNDOWN_DAYS = 366;
const VELOCITY_WINDOW_DAYS = 14;
const DAY_FORMAT = '%Y-%m-%d';

// Minutes a leaf counts for: its estimate, or the scheduler's default
const MINUTES_EXPR = { $cond: [{ $gt: ['$estimatedMinutes', 0] }, '$estimatedMinutes', DEFAULT_ESTIMATED_MINUTES] };

// Local calendar day of an instant, computed by MongoDB in the user's time zone
const localDay = (dateExpr, tz) => ({ $dateToString: { format: DAY_FORMAT, date: dateExpr, timezone: tz } });

// A UTC range guaranteed to contain every instant that falls on a local day
// within [fromKey, toKey] in ANY time zone (offsets span -12h..+14h).
// Exact local-day filtering then happens on the bucketed day strings.
const utcBounds = (fromKey, toKey) => ({
  $gte: keyToUtcDate(addDaysToKey(fromKey, -1)),
  $lt: keyToUtcDate(addDaysToKey(toKey, 2)),
});

const fmt = (minutes) => {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Scope ----------

const resolveGoals = async (owner, goalId) => {
  if (goalId) {
    const goal = await Goal.findOne({ _id: goalId, owner }).lean();
    if (!goal) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Goal not found');
    return [goal];
  }
  return Goal.find({ owner, status: { $ne: 'archived' } }).lean();
};

// ---------- Daily study time ----------

const getDaily = async (owner, goalIds, tz, fromKey, toKey) => {
  const rows = await Session.aggregate([
    {
      $match: {
        owner,
        goalId: { $in: goalIds },
        durationMinutes: { $ne: null },
        startedAt: utcBounds(fromKey, toKey),
      },
    },
    {
      $group: {
        _id: localDay('$startedAt', tz),
        minutes: { $sum: '$durationMinutes' },
        sessions: { $sum: 1 },
      },
    },
  ]);

  const byDay = new Map(rows.map((r) => [r._id, r]));

  // Zero-filled: every day in the range is present
  return keysBetween(fromKey, toKey).map((date) => ({
    date,
    minutes: byDay.get(date)?.minutes ?? 0,
    sessions: byDay.get(date)?.sessions ?? 0,
  }));
};

// ---------- Streak (all goals, local days) ----------

const getStreak = async (owner, tz, todayKey) => {
  const fromKey = addDaysToKey(todayKey, -STREAK_LOOKBACK_DAYS);

  const rows = await Session.aggregate([
    {
      $match: {
        owner,
        durationMinutes: { $gt: 0 },
        startedAt: { $gte: keyToUtcDate(addDaysToKey(fromKey, -1)) },
      },
    },
    { $group: { _id: localDay('$startedAt', tz) } },
  ]);

  const days = rows
    .map((r) => r._id)
    .filter((k) => k >= fromKey && k <= todayKey)
    .sort();
  const active = new Set(days);

  // Current streak: today counts if active; if today is still empty the
  // streak is alive as long as yesterday was active.
  let current = 0;
  let cursor = active.has(todayKey) ? todayKey : addDaysToKey(todayKey, -1);
  while (active.has(cursor)) {
    current += 1;
    cursor = addDaysToKey(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of days) {
    run = previous && daysBetweenKeys(previous, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  return { current, longest, lastActiveDate: days.length ? days[days.length - 1] : null };
};

// ---------- Subject-wise time distribution ----------
// sessions -> topic -> ($graphLookup up the tree) -> top-level subject

const getSubjectTime = async (owner, goalIds, tz, fromKey, toKey, goalTitleById) => {
  const rows = await Session.aggregate([
    {
      $match: {
        owner,
        goalId: { $in: goalIds },
        durationMinutes: { $ne: null },
        startedAt: utcBounds(fromKey, toKey),
      },
    },
    { $addFields: { day: localDay('$startedAt', tz) } },
    { $match: { day: { $gte: fromKey, $lte: toKey } } },
    {
      $group: {
        _id: '$nodeId',
        goalId: { $first: '$goalId' },
        minutes: { $sum: '$durationMinutes' },
        sessions: { $sum: 1 },
      },
    },
    { $lookup: { from: NODES, localField: '_id', foreignField: '_id', as: 'node' } },
    { $unwind: { path: '$node', preserveNullAndEmptyArrays: true } },
    {
      $graphLookup: {
        from: NODES,
        startWith: { $ifNull: ['$node.parentId', null] },
        connectFromField: 'parentId',
        connectToField: '_id',
        as: 'ancestors',
        maxDepth: 3,
      },
    },
    {
      $addFields: {
        subject: {
          $cond: [
            { $eq: ['$node.level', 1] },
            '$node',
            { $first: { $filter: { input: '$ancestors', as: 'a', cond: { $eq: ['$$a.level', 1] } } } },
          ],
        },
      },
    },
    {
      $group: {
        _id: { $ifNull: ['$subject._id', null] }, // null = topics deleted since
        title: { $first: '$subject.title' },
        goalId: { $first: '$goalId' },
        minutes: { $sum: '$minutes' },
        sessions: { $sum: '$sessions' },
        topics: { $sum: 1 },
      },
    },
    { $sort: { minutes: -1 } },
  ]);

  const total = rows.reduce((sum, r) => sum + r.minutes, 0);

  return rows.map((r) => ({
    subjectId: r._id,
    title: r.title ?? 'Deleted topics',
    goalId: r.goalId,
    goalTitle: goalTitleById.get(String(r.goalId)) ?? '',
    minutes: r.minutes,
    sessions: r.sessions,
    topics: r.topics,
    share: total > 0 ? r.minutes / total : 0,
  }));
};

// ---------- Syllabus coverage per subject ----------
// Roadmap leaves rolled up to their top-level subject: how much of each subject is done.

const getCoverage = async (goalIds, goalTitleById) => {
  const rows = await RoadmapNode.aggregate([
    { $match: { goalId: { $in: goalIds }, isActionable: true } },
    {
      $graphLookup: {
        from: NODES,
        startWith: { $ifNull: ['$parentId', null] },
        connectFromField: 'parentId',
        connectToField: '_id',
        as: 'ancestors',
        maxDepth: 3,
      },
    },
    {
      $addFields: {
        subject: {
          $cond: [
            { $eq: ['$level', 1] },
            { _id: '$_id', title: '$title' },
            { $first: { $filter: { input: '$ancestors', as: 'a', cond: { $eq: ['$$a.level', 1] } } } },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$subject._id',
        title: { $first: '$subject.title' },
        goalId: { $first: '$goalId' },
        totalMinutes: { $sum: MINUTES_EXPR },
        doneMinutes: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, MINUTES_EXPR, 0] } },
        nodes: { $sum: 1 },
        doneNodes: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      },
    },
    { $match: { _id: { $ne: null } } },
    { $sort: { totalMinutes: -1 } },
  ]);

  return rows.map((r) => ({
    subjectId: r._id,
    title: r.title ?? 'Untitled',
    goalId: r.goalId,
    goalTitle: goalTitleById.get(String(r.goalId)) ?? '',
    totalMinutes: r.totalMinutes,
    doneMinutes: r.doneMinutes,
    nodes: r.nodes,
    doneNodes: r.doneNodes,
    percent: r.totalMinutes > 0 ? round2(r.doneMinutes / r.totalMinutes) : 0,
  }));
};

// ---------- Study rhythm (weekday x hour, in the user's time zone) ----------
// Minutes are attributed to the hour the session started in.

const getRhythm = async (owner, goalIds, tz, fromKey, toKey) => {
  const rows = await Session.aggregate([
    {
      $match: {
        owner,
        goalId: { $in: goalIds },
        durationMinutes: { $gt: 0 },
        startedAt: utcBounds(fromKey, toKey),
      },
    },
    {
      $addFields: {
        day: localDay('$startedAt', tz),
        dow: { $isoDayOfWeek: { date: '$startedAt', timezone: tz } }, // 1 = Monday ... 7 = Sunday
        hour: { $hour: { date: '$startedAt', timezone: tz } },
      },
    },
    { $match: { day: { $gte: fromKey, $lte: toKey } } },
    {
      $group: {
        _id: { dow: '$dow', hour: '$hour' },
        minutes: { $sum: '$durationMinutes' },
        sessions: { $sum: 1 },
      },
    },
  ]);

  return rows.map((r) => ({ dow: r._id.dow, hour: r._id.hour, minutes: r.minutes, sessions: r.sessions }));
};

// ---------- Efficiency (E-ratio) ----------
// estimated / actual over COMPLETED topics that have both an estimate and logged
// time. > 1 = faster than estimated, < 1 = slower. Unclamped, unlike the
// scheduler's stored ratio.

const getEfficiency = async (goalIds, tz, weeksWindowStart) => {
  const [result] = await RoadmapNode.aggregate([
    {
      $match: {
        goalId: { $in: goalIds },
        isActionable: true,
        status: 'completed',
        estimatedMinutes: { $gt: 0 },
        actualMinutesSpent: { $gt: 0 },
      },
    },
    { $addFields: { doneAt: { $ifNull: ['$completedAt', '$updatedAt'] } } },
    {
      $graphLookup: {
        from: NODES,
        startWith: { $ifNull: ['$parentId', null] },
        connectFromField: 'parentId',
        connectToField: '_id',
        as: 'ancestors',
        maxDepth: 3,
      },
    },
    {
      $addFields: {
        subject: {
          $cond: [
            { $eq: ['$level', 1] },
            { _id: '$_id', title: '$title' },
            { $first: { $filter: { input: '$ancestors', as: 'a', cond: { $eq: ['$$a.level', 1] } } } },
          ],
        },
      },
    },
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              estimated: { $sum: '$estimatedMinutes' },
              actual: { $sum: '$actualMinutesSpent' },
              nodes: { $sum: 1 },
            },
          },
        ],
        byWeek: [
          { $match: { doneAt: { $gte: weeksWindowStart } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: DAY_FORMAT,
                  timezone: tz,
                  date: { $dateTrunc: { date: '$doneAt', unit: 'week', startOfWeek: 'monday', timezone: tz } },
                },
              },
              estimated: { $sum: '$estimatedMinutes' },
              actual: { $sum: '$actualMinutesSpent' },
              nodes: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        bySubject: [
          {
            $group: {
              _id: '$subject._id',
              title: { $first: '$subject.title' },
              estimated: { $sum: '$estimatedMinutes' },
              actual: { $sum: '$actualMinutesSpent' },
              nodes: { $sum: 1 },
            },
          },
          { $sort: { actual: -1 } },
        ],
      },
    },
  ]);

  const overall = result?.overall?.[0] ?? { estimated: 0, actual: 0, nodes: 0 };

  return {
    ratio: overall.actual > 0 ? round2(overall.estimated / overall.actual) : null,
    estimatedMinutes: overall.estimated,
    actualMinutes: overall.actual,
    nodes: overall.nodes,
    lowConfidence: overall.nodes < 3,
    byWeek: (result?.byWeek ?? []).map((w) => ({
      weekStart: w._id,
      ratio: round2(w.estimated / w.actual),
      nodes: w.nodes,
    })),
    bySubject: (result?.bySubject ?? []).map((s) => ({
      subjectId: s._id,
      title: s.title ?? 'Untitled',
      estimatedMinutes: s.estimated,
      actualMinutes: s.actual,
      nodes: s.nodes,
      ratio: round2(s.estimated / s.actual),
      deviationPercent: Math.round((s.actual / s.estimated - 1) * 100), // + = took longer
    })),
  };
};

// ---------- Plan adherence ----------

const getPlanAdherence = async (owner, goalIds, fromKey, toKey, todayKey) => {
  const today = keyToUtcDate(todayKey);

  const rows = await ScheduledTask.aggregate([
    {
      $match: {
        owner,
        goalId: { $in: goalIds },
        scheduledDate: { $gte: keyToUtcDate(fromKey), $lte: keyToUtcDate(toKey) },
      },
    },
    { $group: { _id: { status: '$status', past: { $lt: ['$scheduledDate', today] } }, count: { $sum: 1 } } },
  ]);

  const out = { completed: 0, missed: 0, pushed: 0, overdue: 0, upcoming: 0 };
  for (const { _id, count } of rows) {
    if (_id.status === 'planned') out[_id.past ? 'overdue' : 'upcoming'] += count;
    else out[_id.status] += count;
  }

  // Past-dated tasks that were neither completed nor pushed count against adherence
  const due = out.completed + out.missed + out.overdue;
  return { ...out, adherenceRate: due > 0 ? round2(out.completed / due) : null };
};

// ---------- Burn-down ----------

const buildBurndown = ({ goals, scopeByGoal, completionsByGoal, tz, todayKey, singleGoal }) => {
  const eligible = goals.filter((g) => {
    if (!g.targetDate) return false;
    if (!singleGoal && g.status !== 'active') return false;
    return (scopeByGoal.get(String(g._id))?.totalMinutes ?? 0) > 0;
  });

  if (eligible.length === 0) {
    let reason = 'no_deadline';
    if (goals.length === 0) reason = 'no_goals';
    else if (singleGoal) reason = goals[0].targetDate ? 'no_roadmap' : 'no_deadline';
    return { available: false, reason };
  }

  const metas = eligible.map((goal) => {
    const id = String(goal._id);
    const scope = scopeByGoal.get(id);
    // targetDate is a UTC-midnight calendar day: read it as a date, not an instant
    const targetKey = new Date(goal.targetDate).toISOString().slice(0, 10);
    const createdKey = localDateKey(goal.createdAt, tz);

    return {
      goal,
      targetKey,
      startKey: createdKey > targetKey ? targetKey : createdKey,
      total: scope.totalMinutes,
      remainingNow: scope.totalMinutes - scope.doneMinutes,
      comp: completionsByGoal.get(id) ?? new Map(),
    };
  });

  // Shared date axis across all included goals
  let from = metas.reduce((min, m) => (m.startKey < min ? m.startKey : min), metas[0].startKey);
  const to = metas.reduce((max, m) => (m.targetKey > max ? m.targetKey : max), todayKey);
  if (daysBetweenKeys(from, to) + 1 > MAX_BURNDOWN_DAYS) from = addDaysToKey(to, -(MAX_BURNDOWN_DAYS - 1));
  const keys = keysBetween(from, to);

  const idealSum = new Array(keys.length).fill(0);
  const actualSum = new Array(keys.length).fill(0);

  let velocity = 0;
  let idealNow = 0;
  let requiredDaily = 0;
  let plannedDaily = 0;
  let overdueGoals = 0;

  for (const m of metas) {
    const span = Math.max(1, daysBetweenKeys(m.startKey, m.targetKey));
    const idealAt = (k) => {
      if (k < m.startKey) return m.total;
      if (k >= m.targetKey) return 0;
      return m.total * (1 - daysBetweenKeys(m.startKey, k) / span);
    };

    // Minutes already completed before the first charted day that counts
    const seedUpTo = m.startKey >= from ? m.startKey : addDaysToKey(from, -1);
    let done = 0;
    for (const [day, v] of m.comp) if (day <= seedUpTo) done += v.minutes;

    keys.forEach((k, i) => {
      idealSum[i] += idealAt(k);

      if (k < m.startKey) {
        if (k <= todayKey) actualSum[i] += m.total; // goal not started: nothing done yet
        return;
      }
      if (k > m.startKey && k <= todayKey && m.comp.has(k)) done += m.comp.get(k).minutes;
      if (k <= todayKey) actualSum[i] += m.total - done;
    });

    idealNow += idealAt(todayKey);

    const sinceStart = daysBetweenKeys(m.startKey, todayKey) + 1;
    const windowDays = Math.max(1, Math.min(VELOCITY_WINDOW_DAYS, sinceStart));
    const windowStart = addDaysToKey(todayKey, -(windowDays - 1));
    let recent = 0;
    for (const [day, v] of m.comp) if (day >= windowStart && day <= todayKey) recent += v.minutes;
    velocity += recent / windowDays;

    if (m.remainingNow > 0) {
      plannedDaily += getAdjustedDailyMinutes(m.goal);
      if (m.targetKey >= todayKey) {
        const daysLeft = Math.max(1, daysBetweenKeys(todayKey, m.targetKey) + 1);
        requiredDaily += Math.ceil(m.remainingNow / daysLeft);
      } else {
        overdueGoals += 1;
      }
    }
  }

  const total = metas.reduce((s, m) => s + m.total, 0);
  const remainingNow = metas.reduce((s, m) => s + m.remainingNow, 0);
  const deadlineKey = metas.reduce((max, m) => (m.targetKey > max ? m.targetKey : max), metas[0].targetKey);

  let projectedFinish = null;
  if (remainingNow <= 0) projectedFinish = todayKey;
  else if (velocity > 0 && remainingNow / velocity <= 3650) {
    projectedFinish = addDaysToKey(todayKey, Math.ceil(remainingNow / velocity));
  }

  const delta = remainingNow - idealNow; // + = behind the ideal line
  const tolerance = Math.max(30, 0.03 * total);

  let status;
  if (remainingNow <= 0) status = 'complete';
  else if (overdueGoals > 0) status = 'overdue';
  else if (delta > tolerance) status = 'behind';
  else if (delta < -tolerance) status = 'ahead';
  else status = 'on_track';

  const points = keys.map((k, i) => {
    let projected = null;
    if (k >= todayKey && velocity > 0) {
      projected = Math.max(0, remainingNow - velocity * daysBetweenKeys(todayKey, k));
    }
    return {
      date: k,
      ideal: Math.round(idealSum[i]),
      actual: k <= todayKey ? Math.round(actualSum[i]) : null,
      projected: projected === null ? null : Math.round(projected),
    };
  });

  return {
    available: true,
    goalCount: metas.length,
    todayKey,
    deadline: deadlineKey,
    totalMinutes: total,
    completedMinutes: total - remainingNow,
    remainingMinutes: remainingNow,
    velocityPerDay: Math.round(velocity),
    projectedFinish,
    projectedDaysLate: projectedFinish ? daysBetweenKeys(deadlineKey, projectedFinish) : null,
    status,
    deltaMinutes: Math.round(delta),
    requiredDailyMinutes: requiredDaily,
    plannedDailyMinutes: plannedDaily,
    overdueGoals,
    points,
  };
};

// ---------- Insights (rule-based, no AI, no cost) ----------

const buildInsights = ({ burndown, efficiency, streak }) => {
  const out = [];

  if (burndown.available) {
    const b = burndown;
    if (b.status === 'complete') {
      out.push({ id: 'burndown', tone: 'good', text: 'Everything on this roadmap is complete.' });
    } else if (b.status === 'overdue') {
      out.push({ id: 'burndown', tone: 'warn', text: `${fmt(b.remainingMinutes)} of work remains past its deadline. Extend the deadline or trim the roadmap.` });
    } else if (b.status === 'behind') {
      out.push({
        id: 'burndown',
        tone: 'warn',
        text: `You are ${fmt(b.deltaMinutes)} behind the ideal pace. Finishing on time needs about ${fmt(b.requiredDailyMinutes)} a day; you plan ${fmt(b.plannedDailyMinutes)}.`,
      });
    } else if (b.status === 'ahead') {
      out.push({ id: 'burndown', tone: 'good', text: `You are ${fmt(-b.deltaMinutes)} ahead of the ideal pace.` });
    } else {
      out.push({ id: 'burndown', tone: 'good', text: 'You are on track for your deadline.' });
    }

    if (b.status !== 'complete' && b.velocityPerDay === 0) {
      out.push({ id: 'velocity', tone: 'info', text: 'No topics were completed in the last two weeks, so no finish date can be projected.' });
    }
  }

  if (efficiency.nodes >= 3 && efficiency.ratio) {
    if (efficiency.ratio < 0.85) {
      out.push({
        id: 'estimates',
        tone: 'warn',
        text: `Topics take about ${Math.round((1 / efficiency.ratio - 1) * 100)}% longer than estimated. Consider adding buffer to the plan.`,
      });
    } else if (efficiency.ratio > 1.15) {
      out.push({
        id: 'estimates',
        tone: 'good',
        text: `You finish topics about ${Math.round((efficiency.ratio - 1) * 100)}% faster than estimated.`,
      });
    }

    const worst = efficiency.bySubject.filter((s) => s.nodes >= 2).sort((a, b) => b.deviationPercent - a.deviationPercent)[0];
    if (worst && worst.deviationPercent >= 25) {
      out.push({ id: 'worst-subject', tone: 'info', text: `“${worst.title}” runs ${worst.deviationPercent}% over its estimates, your least accurate subject.` });
    }
  }

  if (streak.current >= 3) {
    out.push({ id: 'streak', tone: 'good', text: `${streak.current}-day streak. Keep it going.` });
  } else if (streak.current === 0 && streak.longest > 0) {
    out.push({ id: 'streak', tone: 'info', text: `Your streak is at 0 (best: ${streak.longest}). One short session today starts a new one.` });
  }

  return out;
};

// ---------- Public entry ----------

export const buildAnalytics = async (userId, { goalId, range, tz }) => {
  const owner = new ObjectId(userId);
  const goals = await resolveGoals(owner, goalId);
  const goalIds = goals.map((g) => g._id);
  const goalTitleById = new Map(goals.map((g) => [String(g._id), g.title]));

  const todayKey = localDateKey(new Date(), tz);
  const fromKey = addDaysToKey(todayKey, -(range - 1));
  const weeksWindowStart = keyToUtcDate(addDaysToKey(todayKey, -(Math.max(range, 56) - 1) - 1));

  const [daily, streak, subjects, efficiency, scopeRows, completionRows, plan, coverage, rhythm] = await Promise.all([
    getDaily(owner, goalIds, tz, fromKey, todayKey),
    getStreak(owner, tz, todayKey),
    getSubjectTime(owner, goalIds, tz, fromKey, todayKey, goalTitleById),
    getEfficiency(goalIds, tz, weeksWindowStart),
    RoadmapNode.aggregate([
      { $match: { goalId: { $in: goalIds }, isActionable: true } },
      {
        $group: {
          _id: '$goalId',
          totalMinutes: { $sum: MINUTES_EXPR },
          doneMinutes: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, MINUTES_EXPR, 0] } },
          nodes: { $sum: 1 },
          doneNodes: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        },
      },
    ]),
    RoadmapNode.aggregate([
      { $match: { goalId: { $in: goalIds }, isActionable: true, status: 'completed' } },
      {
        $group: {
          _id: { goalId: '$goalId', day: localDay({ $ifNull: ['$completedAt', '$updatedAt'] }, tz) },
          minutes: { $sum: MINUTES_EXPR },
          nodes: { $sum: 1 },
        },
      },
    ]),
    getPlanAdherence(owner, goalIds, fromKey, todayKey, todayKey),
    getCoverage(goalIds, goalTitleById),
    getRhythm(owner, goalIds, tz, fromKey, todayKey),
  ]);

  const scopeByGoal = new Map(scopeRows.map((r) => [String(r._id), r]));

  const completionsByGoal = new Map();
  for (const { _id, minutes, nodes } of completionRows) {
    const id = String(_id.goalId);
    if (!completionsByGoal.has(id)) completionsByGoal.set(id, new Map());
    completionsByGoal.get(id).set(_id.day, { minutes, nodes });
  }

  const burndown = buildBurndown({
    goals,
    scopeByGoal,
    completionsByGoal,
    tz,
    todayKey,
    singleGoal: Boolean(goalId),
  });

  // Engine ratio only makes sense for a single goal
  const single = goalId ? goals[0] : null;
  efficiency.engineRatio = single ? round2(single.efficiencyRatio) : null;
  efficiency.engineSessionCount = single ? single.sessionCount : null;

  let completedTopics = 0;
  for (const dayMap of completionsByGoal.values()) {
    for (const [day, v] of dayMap) if (day >= fromKey && day <= todayKey) completedTopics += v.nodes;
  }

  const totalMinutes = daily.reduce((s, d) => s + d.minutes, 0);
  const activeDays = daily.filter((d) => d.minutes > 0).length;
  const bestDay = daily.reduce((best, d) => (d.minutes > (best?.minutes ?? 0) ? d : best), null);

  const summary = {
    totalMinutes,
    sessions: daily.reduce((s, d) => s + d.sessions, 0),
    activeDays,
    avgMinutesPerActiveDay: activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
    bestDay: bestDay ? { date: bestDay.date, minutes: bestDay.minutes } : null,
    completedTopics,
  };

  return {
    range: { days: range, from: fromKey, to: todayKey, tz },
    goalId: goalId ?? null,
    summary,
    daily,
    streak,
    subjects,
    efficiency,
    burndown,
    plan,
    coverage,
    rhythm,
    insights: buildInsights({ burndown, efficiency, streak }),
  };
};