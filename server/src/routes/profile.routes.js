import { Router } from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.js';
import {
  updateProfileSchema,
  avatarUrlSchema,
  deleteAccountSchema,
} from '../validators/profile.validator.js';
import {
  getProfile,
  updateProfile,
  getAvatarSignature,
  setAvatar,
  removeAvatar,
  deleteAccount,
} from '../controllers/profile.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', getProfile);
router.patch('/', validate(updateProfileSchema), updateProfile);
router.post('/avatar/signature', getAvatarSignature);
router.put('/avatar', validate(avatarUrlSchema), setAvatar);
router.delete('/avatar', removeAvatar);
router.delete('/', validate(deleteAccountSchema), deleteAccount);

export default router;