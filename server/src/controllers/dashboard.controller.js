import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { getOverview, getHeatmap, getStreak } from '../services/dashboard.service.js';

// ---------- GET /dashboard/overview ----------

export const getDashboardOverview = asyncHandler(async (req, res) => {
  const overview = await getOverview(req.user._id);
  res.status(200).json(new ApiResponse(200, overview, 'Dashboard overview fetched successfully'));
});

// ---------- GET /dashboard/heatmap ----------

export const getDashboardHeatmap = asyncHandler(async (req, res) => {
  const { goalId } = req.query;
  const heatmap = await getHeatmap(req.user._id, goalId || null);
  res.status(200).json(new ApiResponse(200, { heatmap }, 'Heatmap fetched successfully'));
});

// ---------- GET /dashboard/streak ----------

export const getDashboardStreak = asyncHandler(async (req, res) => {
  const streak = await getStreak(req.user._id);
  res.status(200).json(new ApiResponse(200, streak, 'Streak fetched successfully'));
});