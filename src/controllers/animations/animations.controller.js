import { s3Client, S3_BUCKET } from "../../../config/aws.config.js";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Animation } from "../../models/animations/animation.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";
import yauzl from "yauzl";
import path from "path";
import busboy from "busboy";

// Category display names
const CATEGORY_DISPLAY_NAMES = {
  pouring_water_milk: "Pouring Water/Milk",
  flower_showers: "Flower Showers",
  lighting_lamp: "Lighting Lamp",
  offerings_fruits_sweets: "Offerings Fruits/Sweets",
};

// ==================== PRESIGNED URL HELPER ====================

const generatePresignedUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw error;
  }
};

// ==================== UPLOAD SECTION ====================

// Upload ZIP and process images
export const uploadAnimationZip = asyncHandler(async (req, res) => {
  try {
    const bb = busboy({ headers: req.headers });
    let category = null;
    let title = null;
    let animation = null;
    let zipBuffer = null;
    let responseSent = false;

    const sendResponse = (statusCode, data) => {
      if (!responseSent) {
        responseSent = true;
        res.status(statusCode).json(data);
      }
    };

    // Handle form fields
    bb.on("field", (name, val) => {
      if (name === "category") category = val;
      if (name === "title") title = val;
    });

    // Handle file upload
    bb.on("file", (name, file, info) => {
      const { filename } = info;

      if (!filename.endsWith(".zip")) {
        file.resume();
        return sendResponse(400, { error: "Only ZIP files allowed" });
      }

      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        zipBuffer = Buffer.concat(chunks);
      });
      file.on("error", (err) => {
        console.error("File stream error:", err);
        sendResponse(500, { error: "File upload failed" });
      });
    });

    // Process after upload complete
    bb.on("close", async () => {
      try {
        // Validate inputs
        if (!category) return sendResponse(400, { error: "category is required" });
        if (!title) return sendResponse(400, { error: "title is required" });
        if (!zipBuffer) return sendResponse(400, { error: "No ZIP file uploaded" });

        // Validate category
        if (!Object.keys(CATEGORY_DISPLAY_NAMES).includes(category)) {
          return sendResponse(400, { error: "Invalid category" });
        }

        // Check existing animation
        animation = await Animation.findOne({ category });

        // Process ZIP and upload images
        const folderName = `animations/${category}`;
        const images = await processAnimationZip(zipBuffer, folderName, S3_BUCKET);

        if (images.length === 0) {
          return sendResponse(400, { error: "No valid images found in ZIP" });
        }

        // Create or update animation
        if (!animation) {
          animation = new Animation({ category, title, images, totalImages: images.length });
        } else {
          animation.title = title;
          animation.images = images;
          animation.totalImages = images.length;
        }

        await animation.save();

        // Generate preview URLs for first 5 images
        const previewImages = await Promise.all(
          images.slice(0, 5).map(async (img) => ({
            id: img._id,
            url: await generatePresignedUrl(img.key),
            order: img.order,
            filename: img.filename,
          }))
        );

        sendResponse(200, {
          success: true,
          message: `Processed ${images.length} images for ${CATEGORY_DISPLAY_NAMES[category]}`,
          animation: {
            id: animation._id,
            category: animation.category,
            categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
            title: animation.title,
            totalImages: animation.totalImages,
            previewImages,
          },
        });
      } catch (error) {
        console.error("Processing error:", error);
        sendResponse(500, { error: error.message });
      }
    });

    bb.on("error", (err) => {
      console.error("Busboy error:", err);
      sendResponse(500, { error: "Upload processing failed" });
    });

    req.pipe(bb);
  } catch (error) {
    console.error("Upload error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

// Process ZIP and upload to S3
async function processAnimationZip(zipBuffer, folderName, bucket) {
  return new Promise((resolve, reject) => {
    const images = [];
    let processedCount = 0;

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error("Failed to open ZIP:", err);
        return reject(err);
      }

      zipfile.readEntry();

      zipfile.on("entry", (entry) => {
        const ext = path.extname(entry.fileName).toLowerCase();
        const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);

        if (!isImage || entry.fileName.startsWith("__MACOSX") || entry.fileName.startsWith(".")) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, async (err, readStream) => {
          if (err) {
            console.error(`Error reading ${entry.fileName}:`, err);
            zipfile.readEntry();
            return;
          }

          const chunks = [];
          readStream.on("data", (chunk) => chunks.push(chunk));
          readStream.on("end", async () => {
            try {
              const imageBuffer = Buffer.concat(chunks);
              const cleanFileName = entry.fileName.split("/").pop();
              const orderNumber = String(processedCount + 1).padStart(3, "0");
              const s3Key = `${folderName}/${orderNumber}_${cleanFileName}`;

              // Upload to S3
              await s3Client.send(
                new PutObjectCommand({
                  Bucket: bucket,
                  Key: s3Key,
                  Body: imageBuffer,
                  ContentType: `image/${ext.replace(".", "")}`,
                  CacheControl: "public, max-age=31536000",
                })
              );

              // Store only the key, not the URL
              images.push({
                key: s3Key,
                order: processedCount + 1,
                filename: cleanFileName,
                size: imageBuffer.length,
                uploadedAt: new Date(),
              });

              processedCount++;
              zipfile.readEntry();
            } catch (error) {
              console.error(`Upload error for ${entry.fileName}:`, error);
              zipfile.readEntry();
            }
          });

          readStream.on("error", (streamError) => {
            console.error(`Stream error for ${entry.fileName}:`, streamError);
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        images.sort((a, b) => a.order - b.order);
        resolve(images);
      });

      zipfile.on("error", (zipError) => {
        console.error("ZIP error:", zipError);
        reject(zipError);
      });
    });
  });
}

// ==================== GET FUNCTIONS ====================

// Get all animations
export const getAllAnimations = asyncHandler(async (req, res) => {
  try {
    const { expiresIn = 3600 } = req.query;

    const animations = await Animation.find()
      .sort({ order: 1, createdAt: -1 })
      .select("-__v");

    const animationsWithPreviews = await Promise.all(
      animations.map(async (anim) => {
        let previewUrl = null;
        if (anim.images?.length > 0) {
          previewUrl = await generatePresignedUrl(anim.images[0].key, parseInt(expiresIn));
        }
        return {
          id: anim._id,
          category: anim.category,
          categoryDisplay: CATEGORY_DISPLAY_NAMES[anim.category],
          title: anim.title,
          totalImages: anim.totalImages,
          previewImage: previewUrl,
          isActive: anim.isActive,
          order: anim.order,
          createdAt: anim.createdAt,
          updatedAt: anim.updatedAt,
        };
      })
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          animations: animationsWithPreviews,
          urlExpiry: {
            expiresIn: parseInt(expiresIn),
            expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
          },
        },
        "Animations fetched successfully"
      )
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get active animations
export const getActiveAnimations = asyncHandler(async (req, res) => {
  try {
    const { expiresIn = 3600 } = req.query;

    const animations = await Animation.find({ isActive: true })
      .sort({ order: 1 })
      .select("category title images totalImages");

    const animationsWithPreviews = await Promise.all(
      animations.map(async (anim) => {
        let previewUrl = null;
        if (anim.images?.length > 0) {
          previewUrl = await generatePresignedUrl(anim.images[0].key, parseInt(expiresIn));
        }
        return {
          id: anim._id,
          category: anim.category,
          categoryDisplay: CATEGORY_DISPLAY_NAMES[anim.category],
          title: anim.title,
          totalImages: anim.totalImages,
          previewImage: previewUrl,
        };
      })
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          animations: animationsWithPreviews,
          urlExpiry: {
            expiresIn: parseInt(expiresIn),
            expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
          },
        },
        "Active animations fetched"
      )
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get animation by ID
export const getAnimationById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn = 3600 } = req.query;

    const animation = await Animation.findById(id).select("-__v");
    if (!animation) {
      return res.status(404).json(new ApiResponse(404, null, "Animation not found"));
    }

    const imagesWithUrls = await Promise.all(
      animation.images.map(async (img) => ({
        id: img._id,
        url: await generatePresignedUrl(img.key, parseInt(expiresIn)),
        order: img.order,
        filename: img.filename,
        size: img.size,
        uploadedAt: img.uploadedAt,
      }))
    );

    const response = {
      id: animation._id,
      category: animation.category,
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
      title: animation.title,
      totalImages: animation.totalImages,
      images: imagesWithUrls,
      isActive: animation.isActive,
      order: animation.order,
      createdAt: animation.createdAt,
      updatedAt: animation.updatedAt,
      urlExpiry: {
        expiresIn: parseInt(expiresIn),
        expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
      },
    };

    return res.status(200).json(new ApiResponse(200, response, "Animation fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get animation by category
export const getAnimationByCategory = asyncHandler(async (req, res) => {
  try {
    const { category } = req.params;
    const { expiresIn = 3600 } = req.query;

    if (!Object.keys(CATEGORY_DISPLAY_NAMES).includes(category)) {
      return res.status(400).json(new ApiResponse(400, null, "Invalid category"));
    }

    const animation = await Animation.findOne({ category, isActive: true }).select("-__v");
    if (!animation) {
      return res.status(404).json(new ApiResponse(404, null, "Animation not found for this category"));
    }

    const imagesWithUrls = await Promise.all(
      animation.images.map(async (img) => ({
        id: img._id,
        url: await generatePresignedUrl(img.key, parseInt(expiresIn)),
        order: img.order,
        filename: img.filename,
      }))
    );

    const response = {
      id: animation._id,
      category: animation.category,
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
      title: animation.title,
      totalImages: animation.totalImages,
      images: imagesWithUrls,
      urlExpiry: {
        expiresIn: parseInt(expiresIn),
        expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
      },
    };

    return res.status(200).json(new ApiResponse(200, response, "Animation fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== CRUD FUNCTIONS ====================

// Create animation placeholder
export const createAnimation = asyncHandler(async (req, res) => {
  try {
    const { category, title } = req.body;

    if (!category || !title) {
      return res.status(400).json(new ApiResponse(400, null, "Category and title are required"));
    }

    if (!Object.keys(CATEGORY_DISPLAY_NAMES).includes(category)) {
      return res.status(400).json(new ApiResponse(400, null, "Invalid category"));
    }

    const existingAnimation = await Animation.findOne({ category });
    if (existingAnimation) {
      return res.status(409).json(
        new ApiResponse(409, null, `Animation for ${CATEGORY_DISPLAY_NAMES[category]} already exists`)
      );
    }

    const animation = await Animation.create({
      category,
      title,
      images: [],
      totalImages: 0,
    });

    const response = {
      id: animation._id,
      category: animation.category,
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
      title: animation.title,
      totalImages: 0,
      message: "Animation created. Upload images using /upload-zip endpoint",
    };

    return res.status(201).json(new ApiResponse(201, response, "Animation created successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update animation
export const updateAnimation = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { title, isActive, order } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    const animation = await Animation.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-__v");

    if (!animation) {
      return res.status(404).json(new ApiResponse(404, null, "Animation not found"));
    }

    let previewUrl = null;
    if (animation.images?.length > 0) {
      previewUrl = await generatePresignedUrl(animation.images[0].key);
    }

    const response = {
      id: animation._id,
      category: animation.category,
      categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
      title: animation.title,
      totalImages: animation.totalImages,
      previewImage: previewUrl,
      isActive: animation.isActive,
      order: animation.order,
    };

    return res.status(200).json(new ApiResponse(200, response, "Animation updated successfully"));
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
      return res.status(404).json(new ApiResponse(404, null, "Animation not found"));
    }

    return res.status(200).json(new ApiResponse(200, null, "Animation deleted successfully"));
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
      return res.status(404).json(new ApiResponse(404, null, "Animation not found"));
    }

    animation.isActive = !animation.isActive;
    await animation.save();

    const status = animation.isActive ? "activated" : "deactivated";
    return res.status(200).json(
      new ApiResponse(200, { id: animation._id, isActive: animation.isActive }, `Animation ${status} successfully`)
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// ==================== ADDITIONAL HELPER FUNCTIONS (like godIdol controller) ====================

// Get presigned URL for a single image by its ID
export const getPresignedAnimationImageUrl = asyncHandler(async (req, res) => {
  try {
    const { imageId } = req.params;
    const { expiresIn = 3600 } = req.query;

    const animation = await Animation.findOne({ "images._id": imageId });
    
    if (!animation) {
      return res.status(404).json({ error: "Image not found" });
    }

    const image = animation.images.id(imageId);
    
    if (!image || !image.key) {
      return res.status(404).json({ error: "Image key not found" });
    }

    const url = await generatePresignedUrl(image.key, parseInt(expiresIn));

    res.json({
      success: true,
      url,
      key: image.key,
      expiresIn: parseInt(expiresIn),
      expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
    });

  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get paginated animation images
export const getAnimationImagesPaginated = asyncHandler(async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const expiresIn = parseInt(req.query.expiresIn) || 3600;
    const skip = (page - 1) * limit;

    const animation = await Animation.findOne({ category, isActive: true });

    if (!animation) {
      return res.status(404).json({ error: "Animation not found" });
    }

    const totalImages = animation.images.length;
    const paginatedImages = animation.images
      .sort((a, b) => a.order - b.order)
      .slice(skip, skip + limit);

    const imagesWithUrls = await Promise.all(
      paginatedImages.map(async (img) => ({
        id: img._id,
        url: await generatePresignedUrl(img.key, expiresIn),
        key: img.key,
        order: img.order,
        filename: img.filename,
        size: img.size,
      }))
    );

    res.status(200).json({
      success: true,
      animation: {
        id: animation._id,
        category: animation.category,
        categoryDisplay: CATEGORY_DISPLAY_NAMES[animation.category],
        title: animation.title,
      },
      pagination: {
        page,
        limit,
        totalImages,
        totalPages: Math.ceil(totalImages / limit),
        hasNextPage: page < Math.ceil(totalImages / limit),
        hasPrevPage: page > 1,
      },
      images: imagesWithUrls,
      urlExpiry: {
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Batch generate presigned URLs for animation images
export const batchGenerateAnimationUrls = asyncHandler(async (req, res) => {
  try {
    const { keys } = req.body;
    const { expiresIn = 3600 } = req.query;

    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: "keys array is required" });
    }

    const urls = await Promise.all(
      keys.map(async (key) => {
        const url = await generatePresignedUrl(key, parseInt(expiresIn));
        return { key, url };
      })
    );

    res.json({
      success: true,
      urls,
      count: urls.length,
      expiresIn: parseInt(expiresIn),
      expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
    });

  } catch (error) {
    console.error("Error generating batch URLs:", error);
    res.status(500).json({ error: error.message });
  }
});