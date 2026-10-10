import Notification from '../models/Notification.model.js';
import { sendEmail } from './email.service.js';

const todayKey = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

// Centralized creation point — handles the bundling constraint (via the
// unique index) gracefully, and fans out to email when enabled. Every
// reminder trigger in the cron job below funnels through this.
export const createNotification = async ({ user, type, goalId = null, nodeIds = [], message }) => {
  let notification;

  try {
    notification = await Notification.create({
      owner: user._id,
      type,
      goalId,
      nodeIds,
      message,
      dateKey: todayKey(),
    });
  } catch (err) {
    // E11000 here means a notification of this type/goal already fired
    // today — exactly the bundling rule working as intended, not a bug
    if (err.code === 11000) return null;
    throw err;
  }

  if (user.emailNotificationsEnabled) {
    await sendEmail({
      to: user.email,
      subject: 'Preplytics reminder',
      text: message,
    });
  }

  return notification;
};