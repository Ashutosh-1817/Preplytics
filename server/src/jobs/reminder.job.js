import cron from 'node-cron';
import User from '../models/User.model.js';
import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import Session from '../models/Session.model.js';
import { createNotification } from '../services/notification.service.js';
import { getAdjustedDailyMinutes } from '../services/efficiency.service.js';
import dateOnly from '../utils/dateOnly.js';

const REVISION_THRESHOLD_DAYS = 7;
const DEFAULT_ESTIMATED_MINUTES = 30;

// ---------- 1. Daily inactivity nudge ----------
// Fires once per user, only if they logged zero sessions today.

const checkInactivity = async (user) => {
  const startOfToday = dateOnly(new Date());

  const sessionToday = await Session.findOne({
    owner: user._id,
    startedAt: { $gte: startOfToday },
  });

  if (sessionToday) return;

  await createNotification({
    user,
    type: 'inactivity',
    message: "You haven't logged any study time today — even a short session keeps your momentum going.",
  });
};

// ---------- 2. Falling-behind-pace alert ----------
// Per active goal with a targetDate: can the remaining actionable,
// incomplete work realistically fit in the remaining days at the
// goal's current (efficiency-adjusted) daily capacity?

const checkBehindPace = async (user) => {
  const activeGoals = await Goal.find({
    owner: user._id,
    status: 'active',
    targetDate: { $ne: null },
  });

  for (const goal of activeGoals) {
    const today = dateOnly(new Date());
    const target = dateOnly(goal.targetDate);
    const remainingDays = Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24)));

    const incompleteNodes = await RoadmapNode.find({
      goalId: goal._id,
      isActionable: true,
      status: { $ne: 'completed' },
    }).select('estimatedMinutes');

    if (incompleteNodes.length === 0) continue;

    const totalRemainingMinutes = incompleteNodes.reduce(
      (sum, n) => sum + (n.estimatedMinutes || DEFAULT_ESTIMATED_MINUTES),
      0
    );
    const totalAvailableMinutes = remainingDays * getAdjustedDailyMinutes(goal);

    if (totalRemainingMinutes > totalAvailableMinutes) {
      await createNotification({
        user,
        type: 'behind_pace',
        goalId: goal._id,
        message: `"${goal.title}": ${incompleteNodes.length} topics remain with ${remainingDays} day(s) left — at your current pace this is behind schedule. Consider regenerating your plan.`,
      });
    }
  }
};

// ---------- 3. Revision reminders ----------
// Per active goal: find actionable, completed nodes whose last session
// was more than REVISION_THRESHOLD_DAYS ago, bundle them into one digest.

const checkRevisionDue = async (user) => {
  const activeGoals = await Goal.find({ owner: user._id, status: 'active' });
  const thresholdDate = new Date(Date.now() - REVISION_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  for (const goal of activeGoals) {
    const candidateNodes = await RoadmapNode.find({
      goalId: goal._id,
      isActionable: true,
      status: 'completed',
    }).select('_id title createdAt');

    if (candidateNodes.length === 0) continue;

    const overdueNodeIds = [];

    for (const node of candidateNodes) {
      const lastSession = await Session.findOne({ nodeId: node._id }).sort({ startedAt: -1 });

      const lastTouched = lastSession ? lastSession.startedAt : node.createdAt;
      if (lastTouched < thresholdDate) {
        overdueNodeIds.push(node._id);
      }
    }

    if (overdueNodeIds.length === 0) continue;

    await createNotification({
      user,
      type: 'revision',
      goalId: goal._id,
      nodeIds: overdueNodeIds,
      message: `"${goal.title}": ${overdueNodeIds.length} topic(s) haven't been revisited in over ${REVISION_THRESHOLD_DAYS} days — a quick review keeps them fresh.`,
    });
  }
};

// ---------- The daily job ----------

const runDailyReminders = async () => {
  console.log('[REMINDER JOB] Starting daily reminder sweep...');

  const users = await User.find({}).select('_id email emailNotificationsEnabled');

  for (const user of users) {
    try {
      await checkInactivity(user);
      await checkBehindPace(user);
      await checkRevisionDue(user);
    } catch (err) {
      // One user's failure should never abort the sweep for everyone else
      console.error(`[REMINDER JOB] Failed for user ${user._id}:`, err.message);
    }
  }

  console.log('[REMINDER JOB] Sweep complete.');
};

// Runs once daily at 20:00 server time — server-time-only, per the v1 decision
export const startReminderJob = () => {
  cron.schedule('0 20 * * *', runDailyReminders);
  console.log('[REMINDER JOB] Scheduled for 20:00 server time daily.');
};

// Exported separately so it can be triggered manually for testing,
// without waiting for 8 PM
export const runRemindersNow = runDailyReminders;