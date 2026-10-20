import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { isValidTimeZone } from '../utils/localDate.js';
import { getPrepHub } from '../services/prephub.service.js';

// GET /prephub/:nodeId?tz=Asia/Calcutta
export const getPrepHubController = asyncHandler(async (req, res) => {
  const tzParam = typeof req.query.tz === 'string' ? req.query.tz : 'UTC';
  const tz = isValidTimeZone(tzParam) ? tzParam : 'UTC';

  const data = await getPrepHub(req.user._id, req.params.nodeId, tz);
  res.status(200).json(new ApiResponse(200, data, 'PrepHub loaded successfully'));
});