import mongoose from 'mongoose';

const scheduledTaskSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      required: true,
    },

    nodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoadmapNode',
      required: true,
    },

    // Stored as a UTC midnight Date representing just the calendar day —
    // never compared with time-of-day precision anywhere in this system
    scheduledDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ['planned', 'completed', 'missed', 'pushed'],
      default: 'planned',
    },
  },
  { timestamps: true }
);

// Fast "what's scheduled for this goal in this date range" — the core
// calendar query
scheduledTaskSchema.index({ goalId: 1, scheduledDate: 1 });
// Fast "today view across all of a user's goals"
scheduledTaskSchema.index({ owner: 1, scheduledDate: 1, status: 1 });
// Prevents the same node being double-scheduled on the same day by a
// buggy regeneration call
scheduledTaskSchema.index({ goalId: 1, nodeId: 1, scheduledDate: 1 }, { unique: true });

const ScheduledTask = mongoose.model('ScheduledTask', scheduledTaskSchema);

export default ScheduledTask;