import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { wrappedQuerySchema, wrappedNarrativeBodySchema } from '../validators/wrapped.validator.js';
import { getWrapped, generateWrappedNarrative } from '../services/wrapped.service.js';

const parseOrThrow = (schema, input) => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Validation failed', details);
  }
  return parsed.data;
};

// GET /wrapped?goalId=&range=30&tz=Asia/Calcutta
export const getWrappedController = asyncHandler(async (req, res) => {
  const params = parseOrThrow(wrappedQuerySchema, req.query);
  const data = await getWrapped(req.user._id, params);
  res.status(200).json(new ApiResponse(200, data, 'Wrapped fetched successfully'));
});

// POST /wrapped/narrative  { goalId?, range, tz, force? }
export const generateNarrativeController = asyncHandler(async (req, res) => {
  const { force, ...params } = parseOrThrow(wrappedNarrativeBodySchema, req.body);
  const data = await generateWrappedNarrative(req.user, params, force);
  res.status(200).json(new ApiResponse(200, data, 'Wrapped narrative ready'));
});