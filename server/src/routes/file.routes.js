

import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { signatureRequestSchema, confirmUploadSchema } from '../validators/file.validator.js';
import {
  getUploadSignature,
  confirmUpload,
  getFiles,
  getFileById,
  streamFileContent,
  reextractFile,
  deleteFile,
} from '../controllers/file.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/signature', validate(signatureRequestSchema), getUploadSignature);
router.post('/confirm', validate(confirmUploadSchema), confirmUpload);
router.get('/', getFiles);
router.get('/:fileId/content', streamFileContent);
router.post('/:fileId/reextract', reextractFile);
router.get('/:fileId', getFileById);
router.delete('/:fileId', deleteFile);

export default router;