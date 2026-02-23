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
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    godIdol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GodIdol",
      required: true,
      index: true,
    },
    video: {
      key: { 
        type: String, 
        required: true,
        trim: true 
      },
      url: {
        type: String,
        required: true,
        trim: true,
      },
      filename: { 
        type: String, 
        required: true,
        trim: true 
      },
      size: { 
        type: Number, 
        default: 0 
      },
      uploadedAt: { 
        type: Date, 
        default: Date.now 
      },
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

// Composite unique index for godIdol + category
animationSchema.index({ godIdol: 1, category: 1 }, { unique: true });

// Indexes for better performance
animationSchema.index({ order: 1, category: 1 });
animationSchema.index({ isActive: 1, order: 1 });
animationSchema.index({ category: 1, isActive: 1 });

export const Animation = mongoose.model("Animation", animationSchema);