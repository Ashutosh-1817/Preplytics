

import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let code = ErrorCodes.INTERNAL_SERVER_ERROR;
  let message = 'Something went wrong. Please try again later.';
  let details = null;

  // 1. Our own deliberately-thrown errors — already correctly shaped
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }

  // 2. Mongoose validation errors (e.g. missing required field, failed match regex)
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = ErrorCodes.VALIDATION_ERROR;
    message = 'Validation failed.';
    details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // 3. Mongoose duplicate key error (raw MongoDB driver error, not a named Error subclass)
  else if (err.code === 11000) {
    statusCode = 409;
    code = ErrorCodes.EMAIL_ALREADY_EXISTS;
    const duplicateField = Object.keys(err.keyValue || {})[0] || 'field';
    message = `An account with this ${duplicateField} already exists.`;
    details = { field: duplicateField };
  }

  // 4. Mongoose CastError (e.g. malformed ObjectId in a URL param)
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = ErrorCodes.VALIDATION_ERROR;
    message = `Invalid value for field '${err.path}'.`;
    details = { field: err.path, value: err.value };
  }

  // 5. JWT errors
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = ErrorCodes.TOKEN_EXPIRED;
    message = 'Session expired. Please log in again.';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ErrorCodes.UNAUTHORIZED;
    message = 'Invalid authentication token.';
  }

  // 6. Anything unrecognized — log it, never leak it
  else {
    console.error('[UNHANDLED ERROR]', err);
  }

  // Dev-only: surface the real message/stack for debugging, never in production
  const payload = {
    success: false,
    data: null,
    error: {
      message,
      code,
      ...(details && { details }),
      ...(config.nodeEnv === 'development' && {
        rawMessage: err.message,
        stack: err.stack,
      }),
    },
  };

  res.status(statusCode).json(payload);
};

export default errorHandler;