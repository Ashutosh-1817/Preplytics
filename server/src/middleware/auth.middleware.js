import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from './asyncHandler.js';

// Protects any route it's applied to. Verifies the access token from the
// Authorization header, attaches the user document to req.user, and lets
// the request through. Throws otherwise — errorHandler.js already knows
// how to shape TokenExpiredError/JsonWebTokenError into clean responses,
// but we catch here too so we can attach our own ErrorCodes explicitly
// rather than relying on name-matching in the global handler.
const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'No access token provided');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.accessSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, ErrorCodes.TOKEN_EXPIRED, 'Access token expired');
    }
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Invalid access token');
  }

  // select('-refreshTokens') — req.user never needs to carry every active
  // session's token hashes around for the lifetime of a single request
  const user = await User.findById(decoded.userId).select('-refreshTokens');

  if (!user) {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'User no longer exists');
  }

  req.user = user;
  next();
});

export default requireAuth;