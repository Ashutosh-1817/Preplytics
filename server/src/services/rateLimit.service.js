
import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import config from '../config/env.js';

const todayKey = () => new Date().toISOString().slice(0, 10);

// Atomic, so parallel requests (the syllabus preview fires several at once)
// can never overwrite each other's increments.
export const enforceAiRateLimit = async (user) => {
  const today = todayKey();
  const limit = config.ai.dailyLimit;

  // New day: reset the counter. The filter only matches a stale/missing
  // date, so concurrent first-of-the-day calls can't double-reset.
  await User.updateOne(
    { _id: user._id, 'aiUsage.date': { $ne: today } },
    { $set: { 'aiUsage.date': today, 'aiUsage.count': 0 } }
  );

  // Take one slot only if we're still under the limit
  const updated = await User.findOneAndUpdate(
    { _id: user._id, 'aiUsage.count': { $lt: limit } },
    { $inc: { 'aiUsage.count': 1 } }
  );

  if (!updated) {
    throw new ApiError(
      429,
      ErrorCodes.AI_DAILY_LIMIT_EXCEEDED,
      `Daily AI request limit (${limit}) reached. Try again tomorrow.`
    );
  }
};