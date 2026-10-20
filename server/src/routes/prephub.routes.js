import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import { getPrepHubController } from '../controllers/prephub.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/:nodeId', getPrepHubController);

export default router;