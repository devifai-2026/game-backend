import mongoose from "mongoose";

const splashSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
      trim: true,
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
