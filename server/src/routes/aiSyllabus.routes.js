
import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import {
  generateSyllabusSchema,
  expandChapterSchema,
  bulkInsertSchema,
} from '../validators/aiSyllabus.validator.js';
import { generateAiChapters, expandAiChapter, bulkInsertSyllabus } from '../controllers/aiSyllabus.controller.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.post('/ai-syllabus/chapters', validate(generateSyllabusSchema), generateAiChapters);
router.post('/ai-syllabus/expand', validate(expandChapterSchema), expandAiChapter);
router.post('/bulk-nodes', validate(bulkInsertSchema), bulkInsertSyllabus);

export default router;