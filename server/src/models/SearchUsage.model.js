
import mongoose from 'mongoose';

const searchUsageSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true }, // "YYYY-MM" (UTC)
    credits: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const SearchUsage = mongoose.model('SearchUsage', searchUsageSchema);

export default SearchUsage;