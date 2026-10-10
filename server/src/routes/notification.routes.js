import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import {
  getNotifications,
  markAsRead,
  triggerTestRun,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.patch('/:notificationId/read', markAsRead);
router.post('/trigger-test', triggerTestRun);

export default router;