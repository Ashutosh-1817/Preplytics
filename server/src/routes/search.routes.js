

import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { runSearchSchema, summarizeSchema } from '../validators/search.validator.js';
import { getUsage, search, summarize, getHistory, getOne, remove } from '../controllers/search.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/usage', getUsage);
router.get('/history', getHistory);
router.post('/', validate(runSearchSchema), search);
router.post('/:searchId/summary', validate(summarizeSchema), summarize);
router.get('/:searchId', getOne);
router.delete('/:searchId', remove);

export default router;