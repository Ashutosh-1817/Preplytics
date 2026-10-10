import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      default: null,
    },

    nodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoadmapNode',
      default: null,
    },

    title: {
      type: String,
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
      default: 'Untitled Note',
    },

    // TipTap's native JSON document structure — round-trips losslessly
    // back into the editor. Mixed type since its shape is TipTap's own,
    // not something we validate structurally on our side.
    contentJSON: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Plain-text extraction of the same content, kept in sync on every
    // save — this is what the AI assistant (Phase 9) and any future
    // search feature actually read, never contentJSON directly.
    contentText: {
      type: String,
      default: '',
    },

    tags: {
      type: [String],
      default: [],
      set: (tags) => tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    },

    color: {
      type: String,
      trim: true,
      default: '#FFFFFF',
      match: [/^#([0-9A-Fa-f]{6})$/, 'Color must be a valid 6-digit hex code'],
    },
  },
  { timestamps: true }
);

// Fast "all my notes" and "all notes for this goal" lookups
noteSchema.index({ owner: 1, goalId: 1 });
// Fast "notes for this specific topic" lookups
noteSchema.index({ owner: 1, nodeId: 1 });
// Fast tag-based filtering within a user's own notes
noteSchema.index({ owner: 1, tags: 1 });

const Note = mongoose.model('Note', noteSchema);

export default Note;