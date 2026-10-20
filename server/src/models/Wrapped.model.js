import mongoose from 'mongoose';

// Caches only the AI-written narrative. Stats are always computed live.
const wrappedSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, required: true }, // 'all' or a goalId
    range: { type: Number, required: true },
    periodEnd: { type: String, required: true }, // local YYYY-MM-DD the period ends on
    persona: {
      title: { type: String, required: true },
      tagline: { type: String, default: '' },
    },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
  },
  { timestamps: true }
);

wrappedSchema.index({ owner: 1, scope: 1, range: 1, periodEnd: 1 }, { unique: true });
// Old recaps clean themselves up after 90 days
wrappedSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model('Wrapped', wrappedSchema);