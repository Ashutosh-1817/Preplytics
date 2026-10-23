import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import {
  generateSyllabusSchema,
  expandChapterSchema,
  bulkInsertSchema,
  generateSubjectsSchema,
  expandSubjectSchema,
  bulkInsertGoalSchema,
  saveSubjectListSchema,
  estimateTimeSchema,
} from '../validators/aiSyllabus.validator.js';
import {
  generateAiChapters,
  expandAiChapter,
  bulkInsertSyllabus,
  generateAiSubjects,
  saveSubjectRoadmap,
  expandAiSubject,
  bulkInsertGoalSyllabus,
  saveSubjectList,
  estimateRoadmapTime,
} from '../controllers/aiSyllabus.controller.js';
import { generateOverviewSchema } from '../validators/goalOverview.validator.js';
import { generateOverview } from '../controllers/goalOverview.controller.js';
import { saveSubjectRoadmapSchema } from '../validators/aiSyllabus.validator.js';
import { relevelSchema } from '../validators/relevel.validator.js';
import { previewRelevel, applyRelevel } from '../controllers/relevel.controller.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Single-subject flow (existing modal)
router.post('/ai-syllabus/chapters', validate(generateSyllabusSchema), generateAiChapters);
router.post('/ai-syllabus/expand', validate(expandChapterSchema), expandAiChapter);
router.post('/ai-syllabus/expand', validate(expandChapterSchema), expandAiChapter);
router.post('/bulk-nodes', validate(bulkInsertSchema), bulkInsertSyllabus);

// Whole-goal flow (Phase 1)
router.post('/ai-syllabus/subjects', validate(generateSubjectsSchema), generateAiSubjects);
router.post('/ai-syllabus/subject-breakdown', validate(expandSubjectSchema), expandAiSubject);
router.post('/bulk-subjects', validate(bulkInsertGoalSchema), bulkInsertGoalSyllabus);
// Know Your Goal + contextual per-subject generation (Phase 1.1 / 1.2)
router.post('/overview', validate(generateOverviewSchema), generateOverview);
router.post('/nodes/:nodeId/roadmap', validate(saveSubjectRoadmapSchema), saveSubjectRoadmap);
router.post('/subject-list', validate(saveSubjectListSchema), saveSubjectList);
router.post('/ai-syllabus/estimate', validate(estimateTimeSchema), estimateRoadmapTime);   // <-- add these two lines
router.post('/bulk-nodes', validate(bulkInsertSchema), bulkInsertSyllabus);
router.post('/nodes/:nodeId/relevel/preview', validate(relevelSchema), previewRelevel);
router.post('/nodes/:nodeId/relevel', validate(relevelSchema), applyRelevel);


export default router;