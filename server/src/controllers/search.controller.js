
import SearchHistory from '../models/SearchHistory.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { runSearch, summarizeEntry } from '../services/search.service.js';
import { getSearchUsage } from '../services/searchQuota.service.js';

const serialize = (entry) => {
  const plain = typeof entry.toObject === 'function' ? entry.toObject() : { ...entry };
  delete plain.queryKey;
  delete plain.__v;
  return plain;
};

// ---------- GET /search/usage ----------

export const getUsage = asyncHandler(async (req, res) => {
  const usage = await getSearchUsage(req.user);
  res.status(200).json(new ApiResponse(200, usage, 'Search usage fetched'));
});

// ---------- POST /search ----------

export const search = asyncHandler(async (req, res) => {
  const { entry, cached } = await runSearch({ user: req.user, ...req.body });

  res
    .status(cached ? 200 : 201)
    .json(new ApiResponse(cached ? 200 : 201, { search: serialize(entry), cached }, 'Search complete'));
});

// ---------- POST /search/:searchId/summary ----------

export const summarize = asyncHandler(async (req, res) => {
  const entry = await summarizeEntry({
    user: req.user,
    searchId: req.params.searchId,
    regenerate: req.body.regenerate,
  });

  res.status(200).json(new ApiResponse(200, { search: serialize(entry) }, 'Summary ready'));
});

// ---------- GET /search/history ----------

export const getHistory = asyncHandler(async (req, res) => {
  const history = await SearchHistory.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('query topic depth timeRange summaryStatus createdAt goalId')
    .populate('goalId', 'title color');

  res.status(200).json(new ApiResponse(200, { history }, 'History fetched'));
});

// ---------- GET /search/:searchId ----------

export const getOne = asyncHandler(async (req, res) => {
  const entry = await SearchHistory.findOne({ _id: req.params.searchId, owner: req.user._id });
  if (!entry) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Search not found');

  res.status(200).json(new ApiResponse(200, { search: serialize(entry) }, 'Search fetched'));
});

// ---------- DELETE /search/:searchId ----------

export const remove = asyncHandler(async (req, res) => {
  const deleted = await SearchHistory.findOneAndDelete({ _id: req.params.searchId, owner: req.user._id });
  if (!deleted) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Search not found');

  res.status(200).json(new ApiResponse(200, null, 'Search removed'));
});