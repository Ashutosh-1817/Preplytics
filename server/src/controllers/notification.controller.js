

import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { runRemindersForUser } from '../jobs/reminder.job.js';

const LIST_LIMIT = 50;

const preferencesOf = (user) => ({
  emailNotificationsEnabled: user.emailNotificationsEnabled !== false,
});

// ---------- GET /notifications ----------

export const getNotifications = asyncHandler(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .populate('goalId', 'title color'),
    // The real unread total, which can exceed what the 50-item list shows
    Notification.countDocuments({ owner: req.user._id, isRead: false }),
  ]);

  res
    .status(200)
    .json(new ApiResponse(200, { notifications, unreadCount, preferences: preferencesOf(req.user) }, 'Notifications fetched'));
});

// ---------- GET /notifications/unread-count (cheap, polled by the bell) ----------

export const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ owner: req.user._id, isRead: false });
  res.status(200).json(new ApiResponse(200, { unreadCount }, 'Unread count fetched'));
});

// ---------- PATCH /notifications/:notificationId/read ----------

export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, owner: req.user._id },
    { $set: { isRead: true } },
    { new: true }
  );

  if (!notification) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Notification not found');

  res.status(200).json(new ApiResponse(200, { notification }, 'Notification marked as read'));
});

// ---------- PATCH /notifications/read-all ----------

export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { owner: req.user._id, isRead: false },
    { $set: { isRead: true } }
  );

  res.status(200).json(new ApiResponse(200, { updated: result.modifiedCount }, 'All notifications marked as read'));
});

// ---------- DELETE /notifications/:notificationId ----------

export const deleteNotification = asyncHandler(async (req, res) => {
  const deleted = await Notification.findOneAndDelete({
    _id: req.params.notificationId,
    owner: req.user._id,
  });

  if (!deleted) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Notification not found');

  res.status(200).json(new ApiResponse(200, null, 'Notification dismissed'));
});

// ---------- PATCH /notifications/preferences ----------

export const updatePreferences = asyncHandler(async (req, res) => {
  const { emailNotificationsEnabled } = req.body;

  await User.updateOne({ _id: req.user._id }, { $set: { emailNotificationsEnabled } });

  res
    .status(200)
    .json(new ApiResponse(200, { preferences: { emailNotificationsEnabled } }, 'Preferences updated'));
});

// ---------- POST /notifications/trigger-test (development only) ----------
// Runs YOUR reminder checks right now, instead of waiting for 8 PM.
// Disabled in production so it can never email other users.

export const triggerTestRun = asyncHandler(async (req, res) => {
  if (config.nodeEnv === 'production') {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Route not found');
  }

  await runRemindersForUser(req.user);

  const unreadCount = await Notification.countDocuments({ owner: req.user._id, isRead: false });
  res.status(200).json(new ApiResponse(200, { unreadCount }, 'Reminder check complete'));
});