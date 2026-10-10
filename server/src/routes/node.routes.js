// Separate router for single-node operations that aren't nested under a
// goal in the URL (/nodes/:nodeId rather than /goals/:goalId/nodes/:nodeId)
// since a node's own update/delete doesn't need its parent goal's id in
// the path — the node document already knows its goalId internally.

import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { updateNodeSchema } from '../validators/roadmapNode.validator.js';
import { updateNode, deleteNode } from '../controllers/roadmapNode.controller.js';

const router = Router();

router.use(requireAuth);

router.patch('/:nodeId', validate(updateNodeSchema), updateNode);
router.delete('/:nodeId', deleteNode);

export default router;