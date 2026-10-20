import Goal from '../models/Goal.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { generateGoalOverview } from '../services/goalOverview.service.js';
import { enforceAiRateLimit } from '../services/rateLimit.service.js';
import { getOwnedGoalOrFail } from './goal.controller.js';

// ---------- POST /goals/:goalId/overview ----------
// Returns the saved briefing for free. Only calls the AI when none exists
// yet, or when the user explicitly asks to regenerate.

export const generateOverview = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  if (goal.overview?.status === 'ready' && !req.body.regenerate) {
    return res.status(200).json(new ApiResponse(200, { overview: goal.overview }, 'Overview fetched'));
  }

  await enforceAiRateLimit(req.user);

  const data = await generateGoalOverview(goal.title, goal.description);
  const overview = { status: 'ready', data, generatedAt: new Date() };

  // $set only this field, so a stale in-memory goal can never overwrite other edits
  await Goal.updateOne({ _id: goal._id }, { $set: { overview } });

  res.status(200).json(new ApiResponse(200, { overview }, 'Overview generated'));
});