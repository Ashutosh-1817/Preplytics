import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/env.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    userAgent: {
      type: String,
      default: 'unknown',
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Invalid email address'],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },

    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
    },

    resetPasswordToken: {
      type: String,
      select: false,
    },

    resetPasswordExpires: {
      type: Date,
    },
    
    emailNotificationsEnabled: {
      type: Boolean,
      default: true,
    },
    
    aiUsage: {
      date: { type: String, default: null },   // "YYYY-MM-DD"
      count: { type: Number, default: 0 },
    },
    searchUsage: {
      date: { type: String, default: null },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// ---------- Hooks ----------

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  if (this.password.trim().length < 8) {
    throw new Error('Password cannot be empty or whitespace-only');
  }

  this.password = await bcrypt.hash(this.password, 12);
});

// ---------- Instance methods ----------

userSchema.methods.comparePassword = async function (plainTextPassword) {
  return bcrypt.compare(plainTextPassword, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign({ userId: this._id }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  });
};

userSchema.methods.generateRefreshToken = function () {
  // Raw token returned to the caller — never stored as-is, only its hash is
  return jwt.sign({ userId: this._id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  });
};

userSchema.methods.addRefreshToken = async function (tokenHash, expiresAt, userAgent = 'unknown') {
  // Prune expired entries and push the new one atomically, in two
  // separate atomic operations rather than a read-mutate-save cycle.
  // Neither step requires this document's in-memory version to match,
  // so concurrent calls can never collide here.
  await this.constructor.findByIdAndUpdate(this._id, {
    $pull: { refreshTokens: { expiresAt: { $lte: new Date() } } },
  });
  await this.constructor.findByIdAndUpdate(this._id, {
    $push: { refreshTokens: { tokenHash, expiresAt, userAgent } },
  });
};

userSchema.methods.removeRefreshToken = async function (tokenHash) {
  await this.constructor.findByIdAndUpdate(this._id, {
    $pull: { refreshTokens: { tokenHash } },
  });
};

userSchema.methods.clearAllRefreshTokens = async function () {
  await this.constructor.findByIdAndUpdate(this._id, {
    $set: { refreshTokens: [] },
  });
};

// ---------- Static methods ----------

// Centralized so the controller never hashes a token manually — one
// algorithm, one place, used identically on write and on compare
userSchema.statics.hashToken = function (rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

const User = mongoose.model('User', userSchema);

export default User;