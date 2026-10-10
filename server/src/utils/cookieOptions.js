import config from '../config/env.js';

// Centralized so every place that sets/clears the refresh cookie uses
// identical options — a mismatch between set and clear options (e.g.
// different `path`) silently fails to clear the cookie in some browsers.
const refreshCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge,
});

export default refreshCookieOptions;