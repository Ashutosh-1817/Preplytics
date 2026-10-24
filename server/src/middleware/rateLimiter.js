import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import config from '../config/env.js';

// Small in-memory limiter: at most `max` requests per `windowMs` for each client IP.
// Memory is per server process, which is fine for a single instance. Off in tests.
const rateLimiter = ({ windowMs, max, message = 'Too many attempts. Please wait a bit and try again.' }) => {
  const hits = new Map(); // ip -> { count, resetAt }

  // Drop expired entries now and then so the map cannot grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    if (config.nodeEnv === 'test') return next();

    const now = Date.now();
    const key = req.ip || 'unknown';
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      const waitSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(waitSeconds));
      return next(new ApiError(429, ErrorCodes.TOO_MANY_REQUESTS, message, { waitSeconds }));
    }

    next();
  };
};

export default rateLimiter;