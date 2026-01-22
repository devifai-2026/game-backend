import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: String,
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: String, // hashed

    // OTP fields for forgot password
    otp: {
      type: String,
      default: null,
    },
    otpExpires: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      max: 5,
    },
    lastOtpSent: {
      type: Date,
      default: null,
    },

    // Account security
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
  },
  { timestamps: true },
);

// Index for OTT auto-cleanup (optional)
adminSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 0 });

export const Admin = mongoose.model("Admin", adminSchema);
