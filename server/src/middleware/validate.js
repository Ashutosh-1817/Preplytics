import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return next(
      new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Validation failed', details)
    );
  }

  // req.query (and req.params) are read-only getters in Express 5 —
  // reassigning them directly throws. req.body remains writable, so
  // only query needs this workaround: mutate the existing object's
  // properties in place instead of replacing the object reference.
  if (source === 'query') {
    Object.assign(req.query, result.data);
  } else {
    req[source] = result.data;
  }

  next();
};

export default validate;