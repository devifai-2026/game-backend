import mongoose from "mongoose";

const godIdolSchema = new mongoose.Schema(
  {
    godId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "God",
      required: true,
      unique: true,
    },
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
    // folderName field removed as requested
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Index for faster queries
godIdolSchema.index({ godId: 1 });
godIdolSchema.index({ isActive: 1 });

export const GodIdol = mongoose.model("GodIdol", godIdolSchema);