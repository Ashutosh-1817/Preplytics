import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
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

    startedAt: {
      type: Date,
      required: true,
    },

    // Null while a timer-based session is still running; set on stop
    endedAt: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      min: 0,
      default: null, // computed on stop (timer) or provided directly (manual)
    },

    source: {
      type: String,
      enum: ['timer', 'manual'],
      required: true,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ owner: 1, goalId: 1 });
sessionSchema.index({ nodeId: 1 });
// For "is there an active timer running right now" checks
sessionSchema.index({ owner: 1, endedAt: 1 });

const Session = mongoose.model('Session', sessionSchema);

export default Session;