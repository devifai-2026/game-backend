import mongoose from "mongoose";

const animationSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnimationCategory",
      required: true,
      index: true,
    },
    godIdol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GodIdol",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: false,
      trim: true,
    },
    description: {
      type: String,
      required: false
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
    thumbnail: {
      key: String,
      url: String,
    },
    duration: {
      type: Number, // seconds
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
    views: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);


animationSchema.index({ godIdol: 1, order: 1 });       // fetch by idol
animationSchema.index({ category: 1 });                 // fetch by category
animationSchema.index({ isActive: 1, order: 1 });

export const Animation = mongoose.model("Animation", animationSchema);