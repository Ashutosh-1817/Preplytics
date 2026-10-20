import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { askAiSchema, saveAsNoteSchema } from '../validators/ai.validator.js';
import {
  askAi,
  saveAiResultAsNote,
  getConversations,
  getConversationById,
  deleteConversation,
  deleteAllConversations,
} from '../controllers/ai.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/ask', validate(askAiSchema), askAi);
router.post('/save-as-note', validate(saveAsNoteSchema), saveAiResultAsNote);
router.get('/conversations', getConversations);
router.get('/conversations/:conversationId', getConversationById);
router.delete('/conversations/:conversationId', deleteConversation);
router.delete('/conversations', deleteAllConversations);

export default router;