import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import { createNoteSchema, updateNoteSchema } from '../validators/note.validator.js';
import {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
} from '../controllers/note.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', validate(createNoteSchema), createNote);
router.get('/', getNotes);
router.get('/:noteId', getNoteById);
router.patch('/:noteId', validate(updateNoteSchema), updateNote);
router.delete('/:noteId', deleteNote);

export default router;