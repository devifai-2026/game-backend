import { AnimationCategory } from "../../models/animations/animationCategory.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";

// ==================== CREATE CATEGORY ====================
export const createCategory = asyncHandler(async (req, res) => {
  try {
    const { name, icon, description, order, isActive } = req.body;

    if (!name || !icon) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Name and icon are required"));
    }

    // Check if category already exists
    const existingCategory = await AnimationCategory.findOne({ name });
    if (existingCategory) {
      return res
        .status(409)
        .json(
          new ApiResponse(409, null, "Category with this name already exists"),
        );
    }

    const category = await AnimationCategory.create({
      name,
      icon,
      description: description || "",
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          category,
          "Animation category created successfully",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== GET ALL CATEGORIES ====================
export const getAllCategories = asyncHandler(async (req, res) => {
  try {
    const { search, page = 1, limit = 10, isActive } = req.query;

    const filter = {};

    if (search) {
      filter.$text = { $search: search };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const categories = await AnimationCategory.find(filter)
      .sort({ order: 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AnimationCategory.countDocuments(filter);

    const response = {
      categories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    };

    return res
      .status(200)
      .json(new ApiResponse(200, response, "Categories fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== GET CATEGORY BY ID ====================
export const getCategoryById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AnimationCategory.findById(id);

    if (!category) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Category not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, category, "Category fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== UPDATE CATEGORY ====================
export const updateCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description, order, isActive } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (description !== undefined) updateData.description = description;
    if (order !== undefined) updateData.order = order;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check if new name conflicts with existing
    if (name !== undefined) {
      const existingCategory = await AnimationCategory.findOne({
        name,
        _id: { $ne: id },
      });

      if (existingCategory) {
        return res
          .status(409)
          .json(
            new ApiResponse(
              409,
              null,
              "Category with this name already exists",
            ),
          );
      }
    }

    const category = await AnimationCategory.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Category not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, category, "Category updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== DELETE CATEGORY ====================
export const deleteCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category is used in any animation
    const { Animation } =
      await import("../../models/animations/animation.model.js");
    const usedInAnimations = await Animation.findOne({ category: id });

    if (usedInAnimations) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Cannot delete category that is used in animations",
          ),
        );
    }

    const category = await AnimationCategory.findByIdAndDelete(id);

    if (!category) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Category not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Category deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== TOGGLE CATEGORY STATUS ====================
export const toggleCategoryStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AnimationCategory.findById(id);

    if (!category) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Category not found"));
    }

    category.isActive = !category.isActive;
    await category.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          category,
          `Category ${category.isActive ? "activated" : "deactivated"}`,
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== UPDATE CATEGORY ORDER ====================
export const updateCategoryOrder = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (order === undefined || order < 0) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Valid order number is required"));
    }

    const category = await AnimationCategory.findById(id);

    if (!category) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Category not found"));
    }

    category.order = order;
    await category.save();

    return res
      .status(200)
      .json(
        new ApiResponse(200, category, "Category order updated successfully"),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== GET ACTIVE CATEGORIES ====================
export const getActiveCategories = asyncHandler(async (req, res) => {
  try {
    const categories = await AnimationCategory.find({ isActive: true }).sort({
      order: 1,
      name: 1,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          categories,
          "Active categories fetched successfully",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
