import { God } from "../../models/god/god.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";

// Create new god
export const createGod = asyncHandler(async (req, res) => {
  try {
    const { name, image, description } = req.body;

    if (!name || !image) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Name and image are required"));
    }

    // Check if god already exists
    const existingGod = await God.findOne({ name });
    if (existingGod) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "God with this name already exists"));
    }

    const god = await God.create({
      name,
      image,
      description: description || "",
    });

    return res
      .status(201)
      .json(new ApiResponse(201, god, "God created successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get all gods
export const getAllGods = asyncHandler(async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    
    if (search) {
      filter.$text = { $search: search };
    }
    
    filter.isActive = true;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const gods = await God.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-__v");

    const total = await God.countDocuments(filter);

    const response = {
      gods,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    };

    return res
      .status(200)
      .json(new ApiResponse(200, response, "Gods fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get god by ID
export const getGodById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const god = await God.findById(id).select("-__v");

    if (!god) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, god, "God fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update god
export const updateGod = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, image, description, isActive } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (image !== undefined) updateData.image = image;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check if new name conflicts with existing
    if (name !== undefined) {
      const existingGod = await God.findOne({ 
        name, 
        _id: { $ne: id } 
      });
      
      if (existingGod) {
        return res
          .status(409)
          .json(new ApiResponse(409, null, "God with this name already exists"));
      }
    }

    const god = await God.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select("-__v");

    if (!god) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, god, "God updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Delete god
export const deleteGod = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const god = await God.findByIdAndDelete(id);

    if (!god) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "God deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Search gods by name
export const searchGods = asyncHandler(async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Search query must be at least 2 characters"));
    }

    const gods = await God.find({
      $text: { $search: query },
      isActive: true,
    })
      .limit(10)
      .select("name image");

    return res
      .status(200)
      .json(new ApiResponse(200, gods, "Search results fetched"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});