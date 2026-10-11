

import mongoose from 'mongoose';

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

const sourceSchema = new mongoose.Schema(
  {
    title: String,
    url: String,
    domain: String,
    content: String, // the passage the AI summary is written from
    publishedDate: { type: String, default: '' },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const searchHistorySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },

    query: { type: String, required: true, trim: true, maxlength: 300 },
    queryKey: { type: String, required: true }, // normalized, for cache lookups
    depth: { type: String, enum: ['basic', 'advanced'], default: 'basic' },
    topic: { type: String, enum: ['general', 'news'], default: 'general' },
    timeRange: { type: String, enum: ['any', 'day', 'week', 'month', 'year'], default: 'any' },

    sources: { type: [sourceSchema], default: [] },
    // Markdown with [1] [2] citations, written in a second step
    answer: { type: String, default: '' },
    summaryStatus: { type: String, enum: ['pending', 'ok', 'unavailable'], default: 'pending' },

    creditsUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

searchHistorySchema.index({ owner: 1, createdAt: -1 });
searchHistorySchema.index({ owner: 1, queryKey: 1, depth: 1, topic: 1, timeRange: 1, goalId: 1 });
searchHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);

export default SearchHistory;