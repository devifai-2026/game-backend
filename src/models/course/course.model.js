import mongoose from "mongoose";

const countryPriceSchema = new mongoose.Schema(
  {
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
      uppercase: true,
    },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    packageName: {
      type: String,
      required: [true, "Package name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
    },
    desc: {
      type: String,
      required: [true, "Description is required"],
    },
    shortDesc: {
      type: String,
      maxlength: 200,
    },
    defaultPrice: {
      type: Number,
      required: [true, "Default price is required"],
      min: 0,
    },
    countryPrices: {
      type: Map,
      of: countryPriceSchema,
      default: new Map(),
    },
    bannerImage: {
      type: String,
      required: [true, "Banner image is required"],
    },
    featureImage: {
      type: String,
      required: [true, "Feature image is required"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (v) {
          return v >= this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    duration: {
      type: String,
      required: [true, "Duration is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["upcoming", "running", "completed"],
      default: "upcoming",
    },
    paymentUrl: {
      type: String,
      default: "temp",
    },
  },
  { timestamps: true }
);

// Convert Map to object when returning JSON
courseSchema.methods.toJSON = function () {
  const course = this.toObject();
  if (course.countryPrices instanceof Map) {
    course.countryPrices = Object.fromEntries(course.countryPrices);
  }
  return course;
};

export const Course = mongoose.model("Course", courseSchema);
