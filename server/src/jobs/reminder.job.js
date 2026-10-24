

import cron from 'node-cron';
import config from '../config/env.js';
import User from '../models/User.model.js';
import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import Session from '../models/Session.model.js';
import { createNotification } from '../services/notification.service.js';
import { getCapacityInfo } from '../services/scheduler.service.js';
import dateOnly from '../utils/dateOnly.js';

const REVISION_THRESHOLD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const formatMinutes = (minutes) => {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// ---------- 1. Daily inactivity nudge ----------

const checkInactivity = async (user) => {
  // Nothing to nudge about if there's no active goal
  const hasActiveGoal = await Goal.exists({ owner: user._id, status: 'active' });
  if (!hasActiveGoal) return;

  const studiedToday = await Session.exists({
    owner: user._id,
    startedAt: { $gte: dateOnly(new Date()) },
  });
  if (studiedToday) return;

  await createNotification({
    user,
    type: 'inactivity',
    message: "You haven't logged any study time today. Even a short session keeps your streak alive.",
  });
};

// ---------- 2. Falling behind pace / past deadline ----------
// Uses the same capacity maths as the scheduler, so both always agree.

const checkBehindPace = async (user) => {
  const goals = await Goal.find({ owner: user._id, status: 'active', targetDate: { $ne: null } });
  const today = dateOnly(new Date());

  for (const goal of goals) {
    const info = await getCapacityInfo(goal);
    if (!info.hasDeadline || info.existingRemainingMinutes <= 0) continue;

    if (dateOnly(goal.targetDate) < today) {
      const open = await RoadmapNode.countDocuments({
        goalId: goal._id,
        isActionable: true,
        status: { $ne: 'completed' },
      });

      await createNotification({
        user,
        type: 'behind_pace',
        goalId: goal._id,
        message: `"${goal.title}" is past its deadline with ${plural(open, 'topic')} still open. Extend the deadline or archive the goal.`,
      });
      continue;
    }

    const available = info.days * info.dailyCapacityMinutes;

    if (info.existingRemainingMinutes > available) {
      await createNotification({
        user,
        type: 'behind_pace',
        goalId: goal._id,
        message: `"${goal.title}" needs about ${formatMinutes(info.existingRemainingMinutes)} more study, but only ${formatMinutes(available)} fits before the deadline at your current pace. Adjust your daily time or deadline.`,
      });
    }
  }
};

// ---------- 3. Revision digest: one bundled notification per goal ----------

const checkRevisionDue = async (user) => {
  const goals = await Goal.find({ owner: user._id, status: 'active' }).select('_id title');
  const threshold = Date.now() - REVISION_THRESHOLD_DAYS * MS_PER_DAY;

  for (const goal of goals) {
    const completed = await RoadmapNode.find({
      goalId: goal._id,
      isActionable: true,
      status: 'completed',
    }).select('_id updatedAt');

    if (completed.length === 0) continue;

    // One query for every topic's most recent session, instead of one per topic
    const lastSessions = await Session.aggregate([
      { $match: { nodeId: { $in: completed.map((n) => n._id) }, durationMinutes: { $ne: null } } },
      { $group: { _id: '$nodeId', last: { $max: '$startedAt' } } },
    ]);
    const lastByNode = new Map(lastSessions.map((s) => [s._id.toString(), s.last.getTime()]));

    // "Last touched" = the later of its newest session and its last update
    // (completing a topic updates it), so a topic completed today isn't flagged.
    const overdueIds = completed
      .filter((node) => {
        const touched = Math.max(lastByNode.get(node._id.toString()) ?? 0, node.updatedAt.getTime());
        return touched < threshold;
      })
      .map((node) => node._id);

    if (overdueIds.length === 0) continue;

    await createNotification({
      user,
      type: 'revision',
      goalId: goal._id,
      nodeIds: overdueIds,
      message: `"${goal.title}": ${plural(overdueIds.length, 'topic')} not revisited in over ${REVISION_THRESHOLD_DAYS} days. A quick review keeps them fresh.`,
    });
  }
};

// One user's full check. Used by the daily sweep and the dev test button.
export const runRemindersForUser = async (user) => {
  await checkInactivity(user);
  await checkBehindPace(user);
  await checkRevisionDue(user);
};

const runDailyReminders = async () => {
  console.log('[REMINDER JOB] Starting daily reminder sweep...');

  const users = await User.find({}).select('_id email emailNotificationsEnabled emailVerified');

  for (const user of users) {
    try {
      await runRemindersForUser(user);
    } catch (err) {
      // One user's failure must never stop everyone else's reminders
      console.error(`[REMINDER JOB] Failed for user ${user._id}:`, err.message);
    }
  }

  console.log('[REMINDER JOB] Sweep complete.');
};

export const startReminderJob = () => {
  cron.schedule('0 20 * * *', runDailyReminders, { timezone: config.reminderTimezone });
  console.log(`[REMINDER JOB] Scheduled for 20:00 (${config.reminderTimezone}) daily.`);
};