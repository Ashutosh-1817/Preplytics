import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import { getAnalytics } from '../controllers/analytics.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/overview', getAnalytics);

export default router;