

import mongoose from 'mongoose';

const RETENTION_SECONDS = 60 * 24 * 60 * 60; // notifications expire after 60 days

const notificationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['inactivity', 'behind_pace', 'revision'], required: true },
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
    // Every overdue topic for a revision digest, so the UI can deep-link into one
    nodeIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    // "YYYY-MM-DD". Makes "one notification per goal, type and day" a plain unique index
    dateKey: { type: String, required: true },
  },
  { timestamps: true }
);

notificationSchema.index({ owner: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ owner: 1, goalId: 1, type: 1, dateKey: 1 }, { unique: true });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;