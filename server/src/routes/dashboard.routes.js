import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import {
  getDashboardOverview,
  getDashboardHeatmap,
  getDashboardStreak,
} from '../controllers/dashboard.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/overview', getDashboardOverview);
router.get('/heatmap', getDashboardHeatmap);
router.get('/streak', getDashboardStreak);

export default router;