import { Router } from 'express';
import {
  signup,
  login,
  refreshAccessToken,
  logout,
  verifyEmail,
  resendCode,
  forgotPassword,
  resetPassword,
  googleSignIn,
  changePassword,
  logoutAll,
} from '../controllers/auth.controller.js';
import validate from '../middleware/validate.js';
import {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
  googleSchema,
} from '../validators/auth.validator.js';
import requireAuth from '../middleware/auth.middleware.js';
import ApiResponse from '../utils/ApiResponse.js';
import rateLimiter from '../middleware/rateLimiter.js';
import { changePasswordSchema } from '../validators/profile.validator.js';

const router = Router();

// Brute-force guards (per IP, in memory)
const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Try again in a few minutes.' });
const codeLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 15, message: 'Too many requests. Try again in a few minutes.' });

router.post('/signup', codeLimiter, validate(signupSchema), signup);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/google', loginLimiter, validate(googleSchema), googleSignIn);
router.post('/verify-email', codeLimiter, validate(verifyEmailSchema), verifyEmail);
router.post('/resend-code', codeLimiter, validate(emailOnlySchema), resendCode);
router.post('/forgot-password', codeLimiter, validate(emailOnlySchema), forgotPassword);
router.post('/reset-password', codeLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAll);
router.post('/change-password', requireAuth, validate(changePasswordSchema), changePassword);

// Protected smoke-test route — proves requireAuth works end to end before
// any real feature route depends on it
router.get('/me', requireAuth, (req, res) => {
  res.status(200).json(
    new ApiResponse(
      200,
      {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        emailVerified: req.user.emailVerified === true,
        avatarUrl: req.user.avatarUrl || '',
      },
      'Authenticated user fetched'
    )
  );
});

export default router;