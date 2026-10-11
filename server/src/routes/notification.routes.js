

import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { updatePreferencesSchema } from '../validators/notification.validator.js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  updatePreferences,
  triggerTestRun,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/preferences', validate(updatePreferencesSchema), updatePreferences);
router.post('/trigger-test', triggerTestRun);
router.patch('/:notificationId/read', markAsRead);
router.delete('/:notificationId', deleteNotification);

export default router;