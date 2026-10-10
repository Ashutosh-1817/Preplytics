import Notification from '../models/Notification.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { runRemindersNow } from '../jobs/reminder.job.js';

// ---------- GET /notifications ----------

export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json(new ApiResponse(200, { notifications }, 'Notifications fetched successfully'));
});

// ---------- PATCH /notifications/:notificationId/read ----------

export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.notificationId,
    owner: req.user._id,
  });

  if (!notification) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Notification not found');
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json(new ApiResponse(200, { notification }, 'Notification marked as read'));
});

// ---------- POST /notifications/trigger-test ----------
// Dev-only escape hatch: runs the reminder sweep immediately instead of
// waiting for the 8 PM cron tick, purely so this phase is testable now.

export const triggerTestRun = asyncHandler(async (req, res) => {
  await runRemindersNow();
  res.status(200).json(new ApiResponse(200, null, 'Reminder sweep triggered manually'));
});