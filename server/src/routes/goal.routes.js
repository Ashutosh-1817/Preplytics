import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { createGoalSchema, updateGoalSchema } from '../validators/goal.validator.js';
import { createNodeSchema, updateNodeSchema } from '../validators/roadmapNode.validator.js';
import {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  deleteGoal,
} from '../controllers/goal.controller.js';
import {
  createNode,
  getRoadmapTree,
  updateNode,
  deleteNode,
} from '../controllers/roadmapNode.controller.js';

const router = Router();

// Every route in this file requires authentication
router.use(requireAuth);

router.post('/', validate(createGoalSchema), createGoal);
router.get('/', getGoals);
router.get('/:goalId', getGoalById);
router.patch('/:goalId', validate(updateGoalSchema), updateGoal);
router.delete('/:goalId', deleteGoal);

router.post('/:goalId/nodes', validate(createNodeSchema), createNode);
router.get('/:goalId/nodes', getRoadmapTree);

export default router;