import { Animation } from "../../models/animations/animation.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";

// Category mapping for display
const CATEGORY_DISPLAY_NAMES = {
  pouring_water_milk: "Pouring Water/Milk",
  flower_showers: "Flower Showers",
  lighting_lamp: "Lighting Lamp",
  offerings_fruits_sweets: "Offerings Fruits/Sweets",
};

// Create new animation
export const createAnimation = asyncHandler(async (req, res) => {
  try {
    const { category, title, description, image, videoUrl } = req.body;

    if (!category || !title || !image) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Category, title, and image are required"),
        );
    }

    // Validate category
    if (!Object.keys(CATEGORY_DISPLAY_NAMES).includes(category)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid category"));
    }

    // Check if category already exists
    const existingAnimation = await Animation.findOne({ category });
    if (existingAnimation) {
      return res
        .status(409)
        .json(
          new ApiResponse(
            409,
            null,
            `Animation for ${CATEGORY_DISPLAY_NAMES[category]} category already exists`,
          ),
        );
    }

    const animation = await Animation.create({
      category,
      title,
      description: description || "",
      image,
      videoUrl: videoUrl || "",
    });

    // Add display name to response
    const response = {
      ...animation.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[category],
    };

    return res
      .status(201)
      .json(new ApiResponse(201, response, "Animation created successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get all animations
export const getAllAnimations = asyncHandler(async (req, res) => {
  try {
    const animations = await Animation.find()
      .sort({ order: 1, createdAt: -1 })
      .select("-__v");

    // Add display names
    const animationsWithDisplay = animations.map((anim) => ({
      ...anim.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[anim.category],
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          animationsWithDisplay,
          "Animations fetched successfully",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get active animations for public
export const getActiveAnimations = asyncHandler(async (req, res) => {
  try {
    const animations = await Animation.find({ isActive: true })
      .sort({ order: 1 })
      .select("category title description image videoUrl");

    // Add display names
    const animationsWithDisplay = animations.map((anim) => ({
      ...anim.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[anim.category],
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          animationsWithDisplay,
          "Active animations fetched",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get animation by ID
export const getAnimationById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const animation = await Animation.findById(id).select("-__v");

    if (!animation) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Animation not found"));
    }

    // Add display name
    const response = {
      ...animation.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
    };

    return res
      .status(200)
      .json(new ApiResponse(200, response, "Animation fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get animation by category
export const getAnimationByCategory = asyncHandler(async (req, res) => {
  try {
    const { category } = req.params;

    if (!Object.keys(CATEGORY_DISPLAY_NAMES).includes(category)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid category"));
    }

    const animation = await Animation.findOne({
      category,
      isActive: true,
    }).select("category title description image videoUrl");

    if (!animation) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "Animation not found for this category"),
        );
    }

    // Add display name
    const response = {
      ...animation.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
    };

    return res
      .status(200)
      .json(new ApiResponse(200, response, "Animation fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update animation
export const updateAnimation = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, image, videoUrl, isActive, order } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    // Note: Category cannot be changed as it's unique

    const animation = await Animation.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-__v");

    if (!animation) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Animation not found"));
    }

    // Add display name
    const response = {
      ...animation.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
    };

    return res
      .status(200)
      .json(new ApiResponse(200, response, "Animation updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update animation order
export const updateAnimationOrder = asyncHandler(async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, order }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Updates array is required"));
    }

    const bulkOperations = updates.map(({ id, order }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order } },
      },
    }));

    await Animation.bulkWrite(bulkOperations);

    // Fetch updated list
    const animations = await Animation.find().sort({ order: 1 }).select("-__v");

    // Add display names
    const animationsWithDisplay = animations.map((anim) => ({
      ...anim.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[anim.category],
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          animationsWithDisplay,
          "Order updated successfully",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Delete animation
export const deleteAnimation = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const animation = await Animation.findByIdAndDelete(id);

    if (!animation) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Animation not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Animation deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Toggle animation status
export const toggleAnimationStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const animation = await Animation.findById(id);
    if (!animation) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Animation not found"));
    }

    animation.isActive = !animation.isActive;
    await animation.save();

    const status = animation.isActive ? "activated" : "deactivated";

    // Add display name
    const response = {
      ...animation.toObject(),
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
    };

    return res
      .status(200)
      .json(new ApiResponse(200, response, `Animation ${status} successfully`));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
