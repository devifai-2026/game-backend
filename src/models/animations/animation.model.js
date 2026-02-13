import mongoose from "mongoose";

// Sub-schema for multiple images - removed url field, only store key
const animationImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    order: { type: Number, default: 0 },
    filename: String,
    size: Number,
  },
  { _id: true, timestamps: true },
);

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
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    images: [animationImageSchema],
    totalImages: {
      type: Number,
      default: 0,
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

// Update totalImages before saving
animationSchema.pre("save", function (next) {
  this.totalImages = this.images.length;
  next();
});

// Indexes for better performance
animationSchema.index({ order: 1, category: 1 });
animationSchema.index({ isActive: 1, order: 1 });

export const Animation = mongoose.model("Animation", animationSchema);