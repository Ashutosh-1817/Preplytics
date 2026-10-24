import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import parseDuration from '../utils/parseDuration.js';
import refreshCookieOptions from '../utils/cookieOptions.js';
import { assessEmailDomain } from '../utils/emailChecks.js';
import { googleAuth } from '../services/google.service.js';
import { sendCodeEmail } from '../services/email.service.js';
import { buildCodeRecord, checkCode, cooldownRemaining } from '../services/verification.service.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

// Strips sensitive/internal fields before a user object ever reaches a response
const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified === true,
  avatarUrl: user.avatarUrl || '',
  hasPassword: Boolean(user.password),
  createdAt: user.createdAt,
});

// Creates a fresh code, stores its hash, and emails it. field: 'emailVerification' | 'passwordReset'.
// Returns { sent, waitSeconds }: waitSeconds > 0 means "too soon", nothing was sent.
const issueCode = async (user, field, purpose) => {
  const wait = cooldownRemaining(user[field]);
  if (wait > 0) return { sent: false, waitSeconds: wait };

  const { code, record } = buildCodeRecord(user.email);
  await User.updateOne({ _id: user._id }, { $set: { [field]: record } });

  // In development the code is also printed here, so a demo never depends on the inbox
  if (config.nodeEnv !== 'production') console.log(`[DEV] ${purpose} code for ${user.email}: ${code}`);

  const sent = await sendCodeEmail({ to: user.email, name: user.name, code, purpose });
  return { sent, waitSeconds: 0 };
};

const startSession = async (user, req, res, status, message) => {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const { accessToken, refreshToken } = await issueTokensForUser(user, userAgent);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(parseDuration(config.jwt.refreshExpiry)));
  res.status(status).json(new ApiResponse(status, { user: sanitizeUser(user), accessToken }, message));
};

// Maps a failed code check to the right error
const throwForCodeFailure = (result) => {
  if (result.reason === 'expired') {
    throw new ApiError(400, ErrorCodes.CODE_EXPIRED, 'That code has expired. Request a new one.');
  }
  if (result.reason === 'locked') {
    throw new ApiError(429, ErrorCodes.TOO_MANY_ATTEMPTS, 'Too many wrong attempts. Request a new code.');
  }
  if (result.reason === 'missing') {
    throw new ApiError(400, ErrorCodes.INVALID_CODE, 'No code is pending. Request a new one.');
  }
  throw new ApiError(
    400,
    ErrorCodes.INVALID_CODE,
    `That code is incorrect. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`
  );
};

const issueTokensForUser = async (user, userAgent) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  const tokenHash = User.hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpiry));

  await user.addRefreshToken(tokenHash, expiresAt, userAgent);

  return { accessToken, refreshToken };
};

// ---------- POST /signup ----------
// Creates an UNVERIFIED account and emails a 6-digit code. No session is started until
// the code is entered (POST /verify-email).

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const assessment = await assessEmailDomain(email);
  if (!assessment.ok) {
    throw new ApiError(400, ErrorCodes.INVALID_EMAIL_DOMAIN, assessment.message);
  }

  let user = await User.findOne({ email }).select('+emailVerification');

  if (user && user.emailVerified) {
    throw new ApiError(409, ErrorCodes.EMAIL_ALREADY_EXISTS, 'An account with this email already exists. Log in instead.');
  }

  // An earlier, never-finished signup (or an older account): keep its password untouched,
  // just send a fresh code to the inbox.
  if (!user) {
    user = await User.create({ name, email, password });
  }

  const { sent, waitSeconds } = await issueCode(user, 'emailVerification', 'verify');

  res.status(200).json(
    new ApiResponse(
      200,
      { needsVerification: true, email: user.email, emailSent: sent || waitSeconds > 0, waitSeconds },
      'Account created. Check your email for the verification code.'
    )
  );
});

// ---------- POST /google ----------
// "Continue with Google". Google has already verified the email, so no code step.
//   - known Google id        -> sign in
//   - same email, no Google  -> link the Google login to that account (and mark it verified)
//   - new email              -> create a password-less account

export const googleSignIn = asyncHandler(async (req, res) => {
  const profile = await googleAuth.verify(req.body.credential);

  if (!profile.email || !profile.emailVerified) {
    throw new ApiError(400, ErrorCodes.INVALID_CODE, 'Your Google account has no verified email address.');
  }

  let user = await User.findOne({ googleId: profile.googleId });

  if (!user) {
    user = await User.findOne({ email: profile.email });

    if (user) {
      await User.updateOne(
        { _id: user._id },
        { $set: { googleId: profile.googleId, emailVerified: true, ...(profile.picture && !user.avatarUrl && { avatarUrl: profile.picture }) } }
      );
      user.googleId = profile.googleId;
      user.emailVerified = true;
      if (profile.picture && !user.avatarUrl) user.avatarUrl = profile.picture;
    } else {
      const name = (profile.name || profile.email.split('@')[0]).trim().slice(0, 60);
      user = await User.create({
        name,
        email: profile.email,
        googleId: profile.googleId,
        avatarUrl: profile.picture,
        emailVerified: true,
      });
    }
  }

  await startSession(user, req, res, 200, 'Signed in with Google');
});

// ---------- POST /verify-email ----------

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const user = await User.findOne({ email }).select('+emailVerification');
  if (!user) throw new ApiError(400, ErrorCodes.INVALID_CODE, 'That code is incorrect.');

  if (user.emailVerified) {
    // Already verified (double click, second tab). Never hand out a session without a valid code.
    throw new ApiError(400, ErrorCodes.INVALID_CODE, 'This email is already verified. Please log in.');
  }

  const result = checkCode(user.emailVerification, user.email, code);
  if (!result.ok) {
    if (result.reason === 'wrong') {
      await User.updateOne({ _id: user._id }, { $inc: { 'emailVerification.attempts': 1 } });
    }
    throwForCodeFailure(result);
  }

  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true }, $unset: { emailVerification: '' } });
  user.emailVerified = true;

  await startSession(user, req, res, 200, 'Email verified');
});

// ---------- POST /resend-code ----------
// Same answer whether or not the address exists, so it cannot be used to probe for accounts.

export const resendCode = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+emailVerification');

  if (user && !user.emailVerified) {
    const { sent, waitSeconds } = await issueCode(user, 'emailVerification', 'verify');
    if (waitSeconds > 0) {
      throw new ApiError(429, ErrorCodes.TOO_MANY_REQUESTS, `Please wait ${waitSeconds}s before asking for another code.`, { waitSeconds });
    }
    return res.status(200).json(new ApiResponse(200, { emailSent: sent }, 'If that account needs verifying, a new code is on its way.'));
  }

  res.status(200).json(new ApiResponse(200, { emailSent: true }, 'If that account needs verifying, a new code is on its way.'));
});

// ---------- POST /forgot-password ----------

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordReset');

  if (user) await issueCode(user, 'passwordReset', 'reset');

  res.status(200).json(new ApiResponse(200, null, 'If an account exists for that email, a reset code is on its way.'));
});

// ---------- POST /reset-password ----------

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordReset');
  if (!user) throw new ApiError(400, ErrorCodes.INVALID_CODE, 'That code is incorrect.');

  const result = checkCode(user.passwordReset, user.email, code);
  if (!result.ok) {
    if (result.reason === 'wrong') {
      await User.updateOne({ _id: user._id }, { $inc: { 'passwordReset.attempts': 1 } });
    }
    throwForCodeFailure(result);
  }

  user.password = password; // hashed by the model's pre-save hook
  user.emailVerified = true; // they just proved they own this inbox
  user.passwordReset = undefined;
  await user.save();

  // A reset must end every existing session
  await user.clearAllRefreshTokens();

  res.status(200).json(new ApiResponse(200, null, 'Password updated. Please log in.'));
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
    throw new ApiError(
      401,
      ErrorCodes.INVALID_CREDENTIALS,
      'Invalid email or password. If you signed up with Google, use "Continue with Google".'
    );
  }

  // Correct password but the inbox was never verified: send a code and ask for it
  if (!user.emailVerified) {
    const withCode = await User.findById(user._id).select('+emailVerification');
    await issueCode(withCode, 'emailVerification', 'verify');
    throw new ApiError(403, ErrorCodes.EMAIL_NOT_VERIFIED, 'Please verify your email to continue. We sent you a code.', {
      email: user.email,
    });
  }

  await startSession(user, req, res, 200, 'Login successful');
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


// ---------- POST /change-password (logged in) ----------
// Password accounts must give their current password. Google-only accounts may simply set one.
// Every other device is signed out; this one gets a fresh session.

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (user.password) {
    if (!currentPassword || !(await user.comparePassword(currentPassword))) {
      throw new ApiError(401, ErrorCodes.INVALID_CREDENTIALS, 'Your current password is incorrect.');
    }
    if (currentPassword === newPassword) {
      throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Choose a password different from your current one.');
    }
  }

  user.password = newPassword; // hashed by the model's pre-save hook
  await user.save();
  await user.clearAllRefreshTokens();

  await startSession(user, req, res, 200, 'Password updated. Other devices were signed out.');
});

// ---------- POST /logout-all (logged in) ----------

export const logoutAll = asyncHandler(async (req, res) => {
  await req.user.clearAllRefreshTokens();
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(0));
  res.status(200).json(new ApiResponse(200, null, 'Signed out of all devices'));
});