import { Splash } from "../../models/splash/splash.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";

// Create new splash screen
export const createSplash = asyncHandler(async (req, res) => {
  try {
    const { image, serialNo } = req.body;

    if (!image || !serialNo) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Image and serial number are required"),
        );
    }

    // Check if serial number already exists
    const existingSplash = await Splash.findOne({ serialNo });
    if (existingSplash) {
      return res
        .status(409)
        .json(
          new ApiResponse(
            409,
            null,
            "Splash with this serial number already exists",
          ),
        );
    }

    const splash = await Splash.create({
      image,
      serialNo,
      order: serialNo, // Default order same as serialNo
    });

    return res
      .status(201)
      .json(new ApiResponse(201, splash, "Splash created successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get all splash screens (ordered)
export const getAllSplash = asyncHandler(async (req, res) => {
  try {
    const splashScreens = await Splash.find()
      .sort({ order: 1, serialNo: 1 })
      .select("-__v");

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          splashScreens,
          "Splash screens fetched successfully",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get active splash screens for public
export const getActiveSplash = asyncHandler(async (req, res) => {
  try {
    const splashScreens = await Splash.find({ isActive: true })
      .sort({ order: 1, serialNo: 1 })
      .select("image serialNo");

    return res
      .status(200)
      .json(
        new ApiResponse(200, splashScreens, "Active splash screens fetched"),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update splash screen
export const updateSplash = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { image, serialNo, isActive, order } = req.body;

    const updateData = {};
    if (image !== undefined) updateData.image = image;
    if (serialNo !== undefined) updateData.serialNo = serialNo;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    // Check if new serial number conflicts with existing
    if (serialNo !== undefined) {
      const existingSplash = await Splash.findOne({
        serialNo,
        _id: { $ne: id },
      });

      if (existingSplash) {
        return res
          .status(409)
          .json(new ApiResponse(409, null, "Serial number already exists"));
      }
    }

    const splash = await Splash.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-__v");

    if (!splash) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Splash screen not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, splash, "Splash updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update multiple splash screen orders
export const updateSplashOrder = asyncHandler(async (req, res) => {
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

    await Splash.bulkWrite(bulkOperations);

    // Fetch updated list
    const splashScreens = await Splash.find()
      .sort({ order: 1, serialNo: 1 })
      .select("-__v");

    return res
      .status(200)
      .json(new ApiResponse(200, splashScreens, "Order updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Delete splash screen
export const deleteSplash = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const splash = await Splash.findByIdAndDelete(id);

    if (!splash) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Splash screen not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Splash deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Toggle splash screen status
export const toggleSplashStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const splash = await Splash.findById(id);
    if (!splash) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Splash screen not found"));
    }

    splash.isActive = !splash.isActive;
    await splash.save();

    const status = splash.isActive ? "activated" : "deactivated";
    return res
      .status(200)
      .json(new ApiResponse(200, splash, `Splash ${status} successfully`));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
