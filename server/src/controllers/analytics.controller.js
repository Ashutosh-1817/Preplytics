import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { analyticsQuerySchema } from '../validators/analytics.validator.js';
import { buildAnalytics } from '../services/analytics.service.js';

// ---------- GET /analytics/overview?goalId=&range=30&tz=Asia/Calcutta ----------

export const getAnalytics = asyncHandler(async (req, res) => {
  // Parsed here rather than via the validate middleware: Express 5's req.query
  // is a fresh object per read, so coerced values/defaults wouldn't stick.
  const parsed = analyticsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Validation failed', details);
  }

  const data = await buildAnalytics(req.user._id, parsed.data);
  res.status(200).json(new ApiResponse(200, data, 'Analytics fetched successfully'));
});