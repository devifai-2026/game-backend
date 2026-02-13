import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    order: { type: Number, default: 0 },
    filename: String,
    size: Number,
  },
  { _id: true, timestamps: true },
);

const godIdolSchema = new mongoose.Schema(
  {
    godId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "God",
      required: true,
      index: true,
    },
    images: [imageSchema],
    folderName: String,
    totalImages: { type: Number, default: 0 },
  },
  { timestamps: true },
);

godIdolSchema.pre("save", function (next) {
  this.totalImages = this.images.length;
  next();
});

export const GodIdol = mongoose.model("GodIdol", godIdolSchema);
