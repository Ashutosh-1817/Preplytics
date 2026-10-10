
import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import {
  startSessionSchema,
  stopSessionSchema,
  manualSessionSchema,
} from '../validators/session.validator.js';
import {
  startSession,
  stopSession,
  logManualSession,
  getSessions,
  deleteSession,
  resetNodeSessions,
} from '../controllers/session.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/start', validate(startSessionSchema), startSession);
router.post('/stop', validate(stopSessionSchema), stopSession);
router.post('/manual', validate(manualSessionSchema), logManualSession);
router.get('/', getSessions);
router.delete('/node/:nodeId/reset', resetNodeSessions);
router.delete('/:sessionId', deleteSession);

export default router;