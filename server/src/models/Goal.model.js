import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    targetDate: {
      type: Date,
      default: null, // null = open-ended goal, no fixed deadline
    },

    status: {
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    },

    hasQuestionBank: {
      type: Boolean,
      default: false,
    },

    color: {
      type: String,
      trim: true,
      default: '#6366F1', // sensible default accent color
      match: [/^#([0-9A-Fa-f]{6})$/, 'Color must be a valid 6-digit hex code'],
    },
    dailyAvailableMinutes: {
      type: Number,
      min: 0,
      default: 120, // 2 hours/day, sane default if user doesn't specify
    },

    isOverloaded: {
      type: Boolean,
      default: false, // true when the schedule couldn't fit within the deadline
    },

    efficiencyRatio: {
      type: Number,
      default: 1.0,
    },

    sessionCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// The single most common query in the whole app: "this user's goals"
goalSchema.index({ owner: 1, status: 1 });

const Goal = mongoose.model('Goal', goalSchema);

export default Goal;