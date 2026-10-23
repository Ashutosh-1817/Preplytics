import mongoose from 'mongoose';

// Positions are fractions of the page (0..1) so they survive any zoom or window size
const rectSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    w: { type: Number, required: true, min: 0, max: 1 },
    h: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

export const ANNOTATION_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
export const ANNOTATION_TYPES = ['highlight', 'underline', 'area'];

const annotationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
    nodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoadmapNode', default: null },

    page: { type: Number, required: true, min: 1 },
    type: { type: String, enum: ANNOTATION_TYPES, required: true },
    color: { type: String, enum: ANNOTATION_COLORS, default: 'yellow' },
    rects: { type: [rectSchema], default: [] },

    quote: { type: String, default: '', maxlength: 3000 },
    comment: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

annotationSchema.index({ owner: 1, fileId: 1, page: 1 });

const Annotation = mongoose.model('Annotation', annotationSchema);

export default Annotation;