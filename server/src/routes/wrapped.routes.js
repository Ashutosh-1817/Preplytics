import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import { getWrappedController, generateNarrativeController } from '../controllers/wrapped.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', getWrappedController);
router.post('/narrative', generateNarrativeController);

export default router;