import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import parseDuration from '../utils/parseDuration.js';
import refreshCookieOptions from '../utils/cookieOptions.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

// Strips sensitive/internal fields before a user object ever reaches a response
const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
});

const issueTokensForUser = async (user, userAgent) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  const tokenHash = User.hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpiry));

  await user.addRefreshToken(tokenHash, expiresAt, userAgent);

  return { accessToken, refreshToken };
};

// ---------- POST /signup ----------

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Required-field and format validation (length, email shape, uniqueness)
  // is handled by the Mongoose schema itself — a missing/invalid field here
  // throws a ValidationError, and a duplicate email throws the 11000 error;
  // both are already mapped to clean responses in errorHandler.js.
  const user = await User.create({ name, email, password });

  const userAgent = req.headers['user-agent'] || 'unknown';
  const { accessToken, refreshToken } = await issueTokensForUser(user, userAgent);

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    refreshCookieOptions(parseDuration(config.jwt.refreshExpiry))
  );

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { user: sanitizeUser(user), accessToken },
        'Account created successfully'
      )
    );
});

// ---------- POST /login ----------

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Email and password are required');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // +password: explicitly override the schema's select:false for this one query
  const user = await User.findOne({ email: normalizedEmail }).select('+password');

  // Deliberately identical error for "no such user" and "wrong password" —
  // revealing which one it was lets an attacker enumerate valid emails
  if (!user) {
    throw new ApiError(401, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(401, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  const userAgent = req.headers['user-agent'] || 'unknown';
  const { accessToken, refreshToken } = await issueTokensForUser(user, userAgent);

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    refreshCookieOptions(parseDuration(config.jwt.refreshExpiry))
  );

  res
    .status(200)
    .json(new ApiResponse(200, { user: sanitizeUser(user), accessToken }, 'Login successful'));
});

// ---------- POST /refresh ----------

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!incomingToken) {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'No refresh token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, config.jwt.refreshSecret);
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(0));
    throw new ApiError(401, ErrorCodes.INVALID_REFRESH_TOKEN, 'Refresh token is invalid or expired');
  }

  const user = await User.findById(decoded.userId);

  if (!user) {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(0));
    throw new ApiError(401, ErrorCodes.INVALID_REFRESH_TOKEN, 'User no longer exists');
  }

  const incomingHash = User.hashToken(incomingToken);
  const matchedToken = user.refreshTokens.find((rt) => rt.tokenHash === incomingHash);

  if (!matchedToken) {
    // The token's signature is valid and belongs to this user, but its hash
    // isn't in their current token list — it was already rotated out (or
    // never issued). Treat as theft: kill every session for this user.
    await user.clearAllRefreshTokens();
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(0));
    throw new ApiError(
      401,
      ErrorCodes.REFRESH_TOKEN_REUSE_DETECTED,
      'Refresh token reuse detected. All sessions have been terminated for security.'
    );
  }

  // Rotation: the old hash is removed as part of issuing the new one
  await user.removeRefreshToken(incomingHash);

  const userAgent = req.headers['user-agent'] || 'unknown';
  const { accessToken, refreshToken } = await issueTokensForUser(user, userAgent);

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    refreshCookieOptions(parseDuration(config.jwt.refreshExpiry))
  );

  res.status(200).json(new ApiResponse(200, { accessToken }, 'Token refreshed'));
});

// ---------- POST /logout ----------

export const logout = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.[REFRESH_COOKIE_NAME];

  // Logout is idempotent: no token present just means "already logged out"
  if (incomingToken) {
    try {
      const decoded = jwt.verify(incomingToken, config.jwt.refreshSecret);
      const user = await User.findById(decoded.userId);

      if (user) {
        const incomingHash = User.hashToken(incomingToken);
        await user.removeRefreshToken(incomingHash);
      }
    } catch (err) {
      // Token already invalid/expired — nothing to clean up server-side,
      // still proceed to clear the cookie below
    }
  }

  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(0));
  res.status(200).json(new ApiResponse(200, null, 'Logged out successfully'));
});