import bcrypt from 'bcryptjs';
import config from '../config/env.js';
import cloudinary from '../config/cloudinary.js';
import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import refreshCookieOptions from '../utils/cookieOptions.js';
import { getProfileStats, deleteAllUserData } from '../services/profile.service.js';

const avatarPublicId = (userId) => `preplytics-avatars/${userId}`;

const loadUser = (id) => User.findById(id).select('+password -refreshTokens');

const profileDto = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified === true,
  avatarUrl: user.avatarUrl || '',
  targetExam: user.targetExam || '',
  emailNotificationsEnabled: user.emailNotificationsEnabled !== false,
  hasPassword: Boolean(user.password),
  hasGoogle: Boolean(user.googleId),
  createdAt: user.createdAt,
});

// ---------- GET /profile ----------

export const getProfile = asyncHandler(async (req, res) => {
  const user = await loadUser(req.user._id);
  const stats = await getProfileStats(user._id);
  res.status(200).json(new ApiResponse(200, { user: profileDto(user), stats }, 'Profile fetched'));
});

// ---------- PATCH /profile ----------

export const updateProfile = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: req.body });
  const user = await loadUser(req.user._id);
  res.status(200).json(new ApiResponse(200, { user: profileDto(user) }, 'Profile updated'));
});

// ---------- POST /profile/avatar/signature ----------
// The browser uploads the picture straight to Cloudinary with this signature (same idea as file uploads).

export const getAvatarSignature = asyncHandler(async (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { public_id: avatarPublicId(req.user._id), timestamp, overwrite: true, invalidate: true };
  const signature = cloudinary.utils.api_sign_request(params, config.cloudinary.apiSecret);

  res.status(200).json(
    new ApiResponse(
      200,
      { signature, timestamp, publicId: params.public_id, apiKey: config.cloudinary.apiKey, cloudName: config.cloudinary.cloudName },
      'Avatar upload signature generated'
    )
  );
});

// ---------- PUT /profile/avatar ----------
// Saves the uploaded picture's address, resized to a small square.

export const setAvatar = asyncHandler(async (req, res) => {
  const prefix = `https://res.cloudinary.com/${config.cloudinary.cloudName}/image/upload/`;
  const { url } = req.body;

  if (!url.startsWith(prefix) || !url.includes(`/${avatarPublicId(req.user._id)}`)) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'That picture was not uploaded for your account.');
  }

  const sized = url.replace('/image/upload/', '/image/upload/c_fill,g_face,w_256,h_256,f_auto,q_auto/');
  await User.updateOne({ _id: req.user._id }, { $set: { avatarUrl: sized } });
  const user = await loadUser(req.user._id);
  res.status(200).json(new ApiResponse(200, { user: profileDto(user) }, 'Profile picture updated'));
});

// ---------- DELETE /profile/avatar ----------

export const removeAvatar = asyncHandler(async (req, res) => {
  await cloudinary.uploader.destroy(avatarPublicId(req.user._id), { invalidate: true }).catch(() => {});
  await User.updateOne({ _id: req.user._id }, { $set: { avatarUrl: '' } });
  const user = await loadUser(req.user._id);
  res.status(200).json(new ApiResponse(200, { user: profileDto(user) }, 'Profile picture removed'));
});

// ---------- DELETE /profile ----------

export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await loadUser(req.user._id);

  // Password accounts must re-enter their password; Google-only accounts just type DELETE
  if (user.password) {
    const ok = req.body.password ? await bcrypt.compare(req.body.password, user.password) : false;
    if (!ok) throw new ApiError(401, ErrorCodes.INVALID_CREDENTIALS, 'Password is incorrect.');
  }

  await deleteAllUserData(user._id);
  await cloudinary.uploader.destroy(avatarPublicId(user._id)).catch(() => {});
  await User.deleteOne({ _id: user._id });

  res.clearCookie('refreshToken', refreshCookieOptions(0));
  res.status(200).json(new ApiResponse(200, null, 'Your account and all its data were deleted.'));
});