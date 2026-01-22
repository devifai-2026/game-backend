import mongoose from "mongoose";

const animationSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: [
        "pouring_water_milk",
        "flower_showers",
        "lighting_lamp",
        "offerings_fruits_sweets",
      ],
      trim: true,
      unique: true, // Each category should have only one entry
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    videoUrl: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// Index for ordering and searching
animationSchema.index({ order: 1, category: 1 });

export const Animation = mongoose.model("Animation", animationSchema);
