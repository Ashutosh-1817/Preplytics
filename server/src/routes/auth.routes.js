import { Router } from 'express';
import {
  signup,
  login,
  refreshAccessToken,
  logout,
} from '../controllers/auth.controller.js';
import validate from '../middleware/validate.js';
import { signupSchema, loginSchema } from '../validators/auth.validator.js';
import requireAuth from '../middleware/auth.middleware.js';
import ApiResponse from '../utils/ApiResponse.js';

const router = Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);

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
      },
      'Authenticated user fetched'
    )
  );
});

export default router;