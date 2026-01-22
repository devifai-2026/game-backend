import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    // Basic info
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    
    // Authentication
    password: {
      type: String,
      required: true,
    },
    
    // OTP fields for forgot password
    otp: {
      type: String,
      default: null
    },
    otpExpires: {
      type: Date,
      default: null
    },
    otpAttempts: {
      type: Number,
      default: 0,
      max: 5
    },
    lastOtpSent: {
      type: Date,
      default: null
    },
    
    // Gallery for multiple images
    gallery: [
      {
        imageUrl: {
          type: String,
          required: true,
        },
        imageName: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    
    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    
    // Last login tracking
    lastLogin: Date,
  },
  { 
    timestamps: true 
  }
);

// Index for auto-cleanup of expired OTPs
UserSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 0 });

export const User = mongoose.model("User", UserSchema);