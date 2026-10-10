import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    type: {
      type: String,
      enum: ['inactivity', 'behind_pace', 'revision'],
      required: true,
    },

    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      default: null, // null for user-wide notifications (inactivity)
    },

    // For revision bundles, this holds every overdue node's id so the
    // frontend can deep-link into each one from a single digest notification
    nodeIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    message: {
      type: String,
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ owner: 1, isRead: 1, createdAt: -1 });

// Enforces the bundling rule at the database level: at most one
// notification of a given type per goal per calendar day. dateKey is a
// derived "YYYY-MM-DD" string set at creation time specifically to make
// this uniqueness constraint expressible as a simple compound index.
notificationSchema.add({
  dateKey: {
    type: String,
    required: true,
  },
});

notificationSchema.index({ owner: 1, goalId: 1, type: 1, dateKey: 1 }, { unique: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;