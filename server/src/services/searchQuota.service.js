

import User from '../models/User.model.js';
import SearchUsage from '../models/SearchUsage.model.js';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthKey = () => new Date().toISOString().slice(0, 7);

export const reserveSearch = async (user, cost) => {
  const today = todayKey();
  const month = monthKey();
  const { dailyLimitPerUser, monthlyCreditCap } = config.search;

  // 1. Per-user daily credits. Reset on a new day, then take credits only if they fit.
  await User.updateOne(
    { _id: user._id, 'searchUsage.date': { $ne: today } },
    { $set: { 'searchUsage.date': today, 'searchUsage.count': 0 } }
  );

  const userSlot = await User.findOneAndUpdate(
    { _id: user._id, 'searchUsage.count': { $lte: dailyLimitPerUser - cost } },
    { $inc: { 'searchUsage.count': cost } }
  );

  if (!userSlot) {
    throw new ApiError(
      429,
      ErrorCodes.SEARCH_QUOTA_EXCEEDED,
      `You've used your ${dailyLimitPerUser} daily search credits. They reset tomorrow.`
    );
  }

  // 2. Shared monthly credits
  try {
    await SearchUsage.updateOne({ month }, { $setOnInsert: { credits: 0 } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err; // two requests created this month's row at once: fine
  }

  const monthSlot = await SearchUsage.findOneAndUpdate(
    { month, credits: { $lte: monthlyCreditCap - cost } },
    { $inc: { credits: cost } }
  );

  if (!monthSlot) {
    // Give the user's credits back: nothing was searched
    await User.updateOne(
      { _id: user._id, 'searchUsage.date': today },
      { $inc: { 'searchUsage.count': -cost } }
    );
    throw new ApiError(
      429,
      ErrorCodes.SEARCH_QUOTA_EXCEEDED,
      'The shared monthly search quota is used up. Search is paused until next month.'
    );
  }

  return { cost, today, month };
};

// Called when the search itself failed, so a failed request costs nothing
export const refundSearch = async (user, receipt) => {
  await Promise.all([
    User.updateOne(
      { _id: user._id, 'searchUsage.date': receipt.today, 'searchUsage.count': { $gte: receipt.cost } },
      { $inc: { 'searchUsage.count': -receipt.cost } }
    ),
    SearchUsage.updateOne(
      { month: receipt.month, credits: { $gte: receipt.cost } },
      { $inc: { credits: -receipt.cost } }
    ),
  ]).catch(() => {});
};

// Tavily itself said the plan is exhausted: stop calling it for the rest of the month
export const markMonthExhausted = async () => {
  await SearchUsage.updateOne(
    { month: monthKey() },
    { $set: { credits: config.search.monthlyCreditCap } },
    { upsert: true }
  ).catch(() => {});
};

export const getSearchUsage = async (user) => {
  const today = todayKey();
  const { dailyLimitPerUser, monthlyCreditCap, tavilyApiKey } = config.search;

  const [userDoc, monthDoc] = await Promise.all([
    User.findById(user._id).select('searchUsage'),
    SearchUsage.findOne({ month: monthKey() }),
  ]);

  const usedToday = userDoc?.searchUsage?.date === today ? userDoc.searchUsage.count : 0;
  const usedMonth = monthDoc?.credits ?? 0;

  return {
    configured: Boolean(tavilyApiKey),
    daily: { used: usedToday, limit: dailyLimitPerUser, remaining: Math.max(0, dailyLimitPerUser - usedToday) },
    monthly: { used: usedMonth, cap: monthlyCap(monthlyCreditCap), remaining: Math.max(0, monthlyCreditCap - usedMonth) },
    costs: { basic: 1, advanced: 2 },
  };
};

const monthlyCap = (cap) => cap;