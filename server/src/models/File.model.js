

import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
    nodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoadmapNode', default: null },
    noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null },

    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    fileType: { type: String, enum: ['pdf', 'image', 'document'], required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 0 },

    cloudinaryPublicId: { type: String, required: true, unique: true },
    url: { type: String, required: true },

    // One string per PDF page. select:false keeps list responses small;
    // the AI context asks for it explicitly with .select('+extractedPages').
    extractedPages: { type: [String], default: [], select: false },
    pageCount: { type: Number, default: 0 },

    extractionStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'not_applicable'],
      default: 'pending',
    },
    // Short machine code explaining a failure: DELIVERY_BLOCKED, NO_TEXT, ...
    extractionError: { type: String, default: '' },
  },
  { timestamps: true }
);

fileSchema.index({ owner: 1, goalId: 1 });
fileSchema.index({ owner: 1, nodeId: 1 });
fileSchema.index({ owner: 1, noteId: 1 });
fileSchema.index({ owner: 1, createdAt: -1 });

const File = mongoose.model('File', fileSchema);

export default File;