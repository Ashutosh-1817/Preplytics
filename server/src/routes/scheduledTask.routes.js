import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { updateTaskStatusSchema, calendarQuerySchema } from '../validators/scheduledTask.validator.js';
import {
  generateGoalSchedule,
  regenerateGoalSchedule,
  getGoalCapacity,
  getGoalCalendar,
  getCatchUp,
  getTodayTasks,
  updateTaskStatus,
} from '../controllers/scheduledTask.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/goals/:goalId/schedule/generate', generateGoalSchedule);
router.post('/goals/:goalId/schedule/regenerate', regenerateGoalSchedule);
router.get('/goals/:goalId/schedule/capacity', getGoalCapacity);
router.get('/goals/:goalId/schedule/catch-up', getCatchUp);
router.get('/goals/:goalId/schedule/calendar', validate(calendarQuerySchema, 'query'), getGoalCalendar);

router.get('/tasks/today', getTodayTasks);
router.patch('/tasks/:taskId/status', validate(updateTaskStatusSchema), updateTaskStatus);

export default router;