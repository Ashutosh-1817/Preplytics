import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import {
  listAnnotationsSchema,
  createAnnotationSchema,
  updateAnnotationSchema,
} from '../validators/annotation.validator.js';
import {
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from '../controllers/annotation.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate(listAnnotationsSchema, 'query'), getAnnotations);
router.post('/', validate(createAnnotationSchema), createAnnotation);
router.patch('/:annotationId', validate(updateAnnotationSchema), updateAnnotation);
router.delete('/:annotationId', deleteAnnotation);

export default router;