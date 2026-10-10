

import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

const notFound = (req, res, next) => {
  next(new ApiError(404, ErrorCodes.NOT_FOUND, `Route not found - ${req.originalUrl}`));
};

export default notFound;