import mongoose from "mongoose";

const splashSchema = new mongoose.Schema(
  {
    video: {
      key: {
        type: String,
        required: true,
        trim: true,
      },
      url: {
        type: String,
        required: true,
        trim: true,
      },
      filename: {
        type: String,
        required: true,
        trim: true,
      },
      size: {
        type: Number,
        default: 0,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
    serialNo: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Index for ordering
splashSchema.index({ order: 1, serialNo: 1 });

export const Splash = mongoose.model("Splash", splashSchema);