import {
  s3Client,
  S3_BUCKET,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "../../../config/aws.config.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GodIdol } from "../../models/godIdol/godIdol.model.js";
import { God } from "../../models/god/god.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { Animation } from "../../models/animations/animation.model.js";
import { AnimationCategory } from "../../models/animations/animationCategory.model.js";
import { CopyObjectCommand } from "@aws-sdk/client-s3"
import busboy from "busboy";
import path from "path";
import mongoose from "mongoose";

// ==================== CREATE GOD IDOL VIDEO ====================
export const createGodIdol = asyncHandler(async (req, res) => {
  const bb = busboy({
    headers: req.headers,
    limits: {
      files: 1,
      fileSize: 100 * 1024 * 1024, // 100MB
    },
  });

  const fields = {};
  let videoFile = null;
  let uploadError = null;
  let responseSent = false;

  // Create a promise to track file upload completion
  let fileUploadResolve, fileUploadReject;
  const fileUploadPromise = new Promise((resolve, reject) => {
    fileUploadResolve = resolve;
    fileUploadReject = reject;
  });

  // Fields collection
  bb.on("field", (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on("file", (fieldname, fileStream, info) => {
    const { godId } = fields;

    if (!godId) {
      uploadError = new Error("godId is required");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(godId)) {
      uploadError = new Error(
        "Invalid godId format - must be a valid MongoDB ObjectId",
      );
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    // File type validation
    const { filename, mimeType } = info;
    if (!mimeType.startsWith("video/")) {
      uploadError = new Error("Only video files are allowed");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, "-");
    const key = `god-idol/${basename}-${timestamp}-${randomString}${ext}`;

    // Collect file data in buffer
    const chunks = [];
    fileStream.on("data", (chunk) => chunks.push(chunk));

    fileStream.on("end", async () => {
      try {
        // Check if god exists
        const godExists = await God.findById(godId);

        if (!godExists) {
          uploadError = new Error("God not found with the provided godId");
          fileUploadReject(uploadError);
          return;
        }

        // Check if video already exists for this god
        const existingIdol = await GodIdol.findOne({ godId });
        if (existingIdol) {
          uploadError = new Error("Idol video already exists for this god");
          fileUploadReject(uploadError);
          return;
        }

        const fileBuffer = Buffer.concat(chunks);

        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
        });

        const result = await s3Client.send(command);

        videoFile = {
          key,
          url: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
          filename,
          size: fileBuffer.length,
          mimeType,
          etag: result.ETag,
        };

        console.log("God Idol video uploaded successfully:", key);
        fileUploadResolve();
      } catch (error) {
        console.error("S3 upload error:", error);
        uploadError = error;
        fileUploadReject(error);
      }
    });

    fileStream.on("error", (error) => {
      uploadError = error;
      fileUploadReject(error);
    });
  });

  // Handle finish event
  bb.on("finish", async () => {
    if (responseSent) return;

    try {
      // Wait for file upload to complete
      await fileUploadPromise;

      if (uploadError) {
        responseSent = true;
        return res
          .status(400)
          .json(new ApiResponse(400, null, uploadError.message));
      }

      const { godId, isActive } = fields;

      // Remove folderName from creation
      const godIdol = await GodIdol.create({
        godId,
        video: {
          key: videoFile.key,
          url: videoFile.url,
          filename: videoFile.filename,
          size: videoFile.size,
          uploadedAt: new Date(),
        },
        isActive: isActive === "true" || isActive === true,
      });

      responseSent = true;
      return res
        .status(201)
        .json(
          new ApiResponse(201, godIdol, "God idol video created successfully"),
        );
    } catch (error) {
      // Cleanup if database error occurs
      if (videoFile?.key) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: videoFile.key,
            }),
          );
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }
      }

      responseSent = true;
      return res
        .status(500)
        .json(
          new ApiResponse(500, null, error.message || "File upload failed"),
        );
    }
  });

  // Handle busboy error
  bb.on("error", (error) => {
    if (responseSent) return;
    responseSent = true;
    return res.status(500).json(new ApiResponse(500, null, error.message));
  });

  // Pipe the request to busboy
  req.pipe(bb);
});

// ==================== CREATE GOD IDOL WITH ANIMATIONS ====================
export const createGodIdolWithAnimation = asyncHandler(async (req, res) => {
  const bb = busboy({
    headers: req.headers,
    limits: {
      files: 2,
      fileSize: 100 * 1024 * 1024, // 100MB per file
    },
  });

  const fields = {};
  const uploadedFiles = {
    godIdolVideo: null,
    animationVideo: null,
  };
  let uploadError = null;
  let responseSent = false;

  let fileUploadResolve, fileUploadReject;
  const fileUploadPromise = new Promise((resolve, reject) => {
    fileUploadResolve = resolve;
    fileUploadReject = reject;
  });

  let pendingUploads = 0;
  let completedUploads = 0;

  // Fields collection
  bb.on("field", (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on("file", (fieldname, fileStream, info) => {
    pendingUploads++;

    const { filename, mimeType } = info;

    if (!mimeType.startsWith("video/")) {
      uploadError = new Error("Only video files are allowed");
      fileStream.resume();
      if (--pendingUploads === 0 && completedUploads === 0) {
        fileUploadReject(uploadError);
      }
      return;
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, "-");

    let key;
    if (fieldname === "godIdolVideo") {
      key = `god-idol/${basename}-${timestamp}-${randomString}${ext}`;
    } else if (fieldname === "animationVideo") {
      key = `temp/animations/${basename}-${timestamp}-${randomString}${ext}`;
    } else {
      uploadError = new Error("Invalid field name");
      fileStream.resume();
      if (--pendingUploads === 0 && completedUploads === 0) {
        fileUploadReject(uploadError);
      }
      return;
    }

    const chunks = [];
    fileStream.on("data", (chunk) => chunks.push(chunk));

    fileStream.on("end", async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);

        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
        });

        const result = await s3Client.send(command);

        uploadedFiles[fieldname] = {
          key,
          url: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
          filename,
          size: fileBuffer.length,
          mimeType,
          etag: result.ETag,
          uploadedAt: new Date(),
        };

        console.log(`${fieldname} uploaded successfully:`, key);

        completedUploads++;
        if (completedUploads === pendingUploads) {
          fileUploadResolve();
        }
      } catch (error) {
        console.error("S3 upload error:", error);
        uploadError = error;
        fileUploadReject(error);
      }
    });

    fileStream.on("error", (error) => {
      uploadError = error;
      fileUploadReject(error);
    });
  });

  // Handle finish event
  bb.on("finish", async () => {
    if (responseSent) return;

    try {
      // Wait for all file uploads to complete
      await fileUploadPromise;

      if (uploadError) {
        responseSent = true;
        return res
          .status(400)
          .json(new ApiResponse(400, null, uploadError.message));
      }

      // Validate required fields
      const { godId, categoryId, title, description, order, isActive } = fields;

      if (!godId) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(400)
          .json(new ApiResponse(400, null, "godId is required"));
      }

      if (!categoryId) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(400)
          .json(new ApiResponse(400, null, "categoryId is required"));
      }

      // if (!title) {
      //   await cleanupUploadedFiles(uploadedFiles);
      //   responseSent = true;
      //   return res
      //     .status(400)
      //     .json(new ApiResponse(400, null, "title is required"));
      // }

      if (!uploadedFiles.godIdolVideo) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(400)
          .json(new ApiResponse(400, null, "God idol video is required"));
      }

      if (!uploadedFiles.animationVideo) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Animation video is required"));
      }

      // Validate godId
      const godExists = await God.findById(godId);
      if (!godExists) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(404)
          .json(new ApiResponse(404, null, "God not found"));
      }

      // Validate categoryId
      const categoryExists = await AnimationCategory.findById(categoryId);
      if (!categoryExists) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Animation category not found"));
      }

      // Check if godIdol already exists for this god
      const existingIdol = await GodIdol.findOne({ godId });
      if (existingIdol) {
        await cleanupUploadedFiles(uploadedFiles);
        responseSent = true;
        return res
          .status(409)
          .json(
            new ApiResponse(409, null, "God idol already exists for this god"),
          );
      }

      // Start a session for transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // STEP 1: Create GodIdol
        const godIdol = await GodIdol.create(
          [
            {
              godId,
              video: uploadedFiles.godIdolVideo,
              isActive: isActive === "true" || isActive === true,
            },
          ],
          { session },
        );

        // STEP 2: Move animation video from temp to permanent location
        const tempKey = uploadedFiles.animationVideo.key;
        const permanentKey = `animations/${categoryId}/${path.basename(tempKey)}`;

        // Copy file from temp to permanent location
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: S3_BUCKET,
            CopySource: `${S3_BUCKET}/${tempKey}`,
            Key: permanentKey,
          }),
        );

        // Delete temp file
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: tempKey,
          }),
        );

        // Update video info with permanent URL
        const animationVideoData = {
          ...uploadedFiles.animationVideo,
          key: permanentKey,
          url: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${permanentKey}`,
        };

        // STEP 3: Create Animation
        const animation = await Animation.create(
          [
            {
              category: categoryId,
              godIdol: godIdol[0]._id,
              title,
              description: description || "",
              video: animationVideoData,
              order: order ? parseInt(order) : 0,
              isActive: true,
            },
          ],
          { session },
        );

        await session.commitTransaction();
        session.endSession();

        const response = {
          godIdol: godIdol[0],
          animation: animation[0],
        };

        responseSent = true;
        return res
          .status(201)
          .json(
            new ApiResponse(
              201,
              response,
              "God idol and animation created successfully",
            ),
          );
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    } catch (error) {
      // Cleanup all uploaded files
      await cleanupUploadedFiles(uploadedFiles);

      responseSent = true;
      return res
        .status(500)
        .json(new ApiResponse(500, null, error.message || "Upload failed"));
    }
  });

  // Handle busboy error
  bb.on("error", (error) => {
    if (responseSent) return;
    responseSent = true;
    return res.status(500).json(new ApiResponse(500, null, error.message));
  });

  // Pipe the request to busboy
  req.pipe(bb);
});

async function cleanupUploadedFiles(uploadedFiles) {
  for (const [fieldName, fileData] of Object.entries(uploadedFiles)) {
    if (fileData?.key) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: fileData.key,
          }),
        );
        console.log(`Cleaned up ${fieldName}:`, fileData.key);
      } catch (err) {
        console.error(`Cleanup error for ${fieldName}:`, err);
      }
    }
  }
}

// ==================== UPDATE GOD IDOL VIDEO ====================
export const updateGodIdol = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find existing idol
  const godIdol = await GodIdol.findById(id);
  if (!godIdol) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "God idol not found"));
  }

  const bb = busboy({
    headers: req.headers,
    limits: {
      files: 1,
      fileSize: 100 * 1024 * 1024,
    },
  });

  const fields = {};
  let videoFile = null;
  let uploadError = null;
  let responseSent = false;

  let fileUploadResolve, fileUploadReject;
  const fileUploadPromise = new Promise((resolve, reject) => {
    fileUploadResolve = resolve;
    fileUploadReject = reject;
  });

  bb.on("field", (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on("file", (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;

    if (!mimeType.startsWith("video/")) {
      uploadError = new Error("Only video files are allowed");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, "-");
    const key = `god-idol/${basename}-${timestamp}-${randomString}${ext}`;

    const chunks = [];
    fileStream.on("data", (chunk) => chunks.push(chunk));

    fileStream.on("end", async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);

        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
        });

        const result = await s3Client.send(command);

        videoFile = {
          key,
          url: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
          filename,
          size: fileBuffer.length,
          mimeType,
          etag: result.ETag,
        };

        console.log("New video uploaded successfully:", key);
        fileUploadResolve();
      } catch (error) {
        console.error("S3 upload error:", error);
        uploadError = error;
        fileUploadReject(error);
      }
    });

    fileStream.on("error", (error) => {
      uploadError = error;
      fileUploadReject(error);
    });
  });

  bb.on("finish", async () => {
    if (responseSent) return;

    try {
      // Only wait for file upload if there was a file
      if (Object.keys(fields).length > 0 || videoFile) {
        await fileUploadPromise;
      }

      if (uploadError) {
        responseSent = true;
        return res
          .status(500)
          .json(new ApiResponse(500, null, uploadError.message));
      }

      const { godId, isActive } = fields; // Removed folderName

      // Check godId conflict
      if (godId && godId.toString() !== godIdol.godId.toString()) {
        const existing = await GodIdol.findOne({ godId });
        if (existing) {
          if (videoFile?.key) {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: S3_BUCKET,
                Key: videoFile.key,
              }),
            );
          }

          responseSent = true;
          return res
            .status(409)
            .json(
              new ApiResponse(
                409,
                null,
                "Idol video already exists for this god",
              ),
            );
        }
        godIdol.godId = godId;
      }

      // If new video uploaded
      if (videoFile) {
        // Delete old video from S3
        if (godIdol.video.key) {
          try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: S3_BUCKET,
                Key: godIdol.video.key,
              }),
            );
            console.log("Old video deleted from S3:", godIdol.video.key);
          } catch (err) {
            console.error("Error deleting old video:", err);
          }
        }

        // Update with new video
        godIdol.video = {
          key: videoFile.key,
          url: videoFile.url,
          filename: videoFile.filename,
          size: videoFile.size,
          uploadedAt: new Date(),
        };
      }

      // Update other fields (folderName removed)
      if (isActive !== undefined)
        godIdol.isActive = isActive === "true" || isActive === true;

      await godIdol.save();

      responseSent = true;
      return res
        .status(200)
        .json(new ApiResponse(200, godIdol, "God idol updated successfully"));
    } catch (error) {
      responseSent = true;
      return res
        .status(500)
        .json(new ApiResponse(500, null, error.message || "Update failed"));
    }
  });

  bb.on("error", (error) => {
    if (responseSent) return;
    responseSent = true;
    return res.status(500).json(new ApiResponse(500, null, error.message));
  });

  req.pipe(bb);
});

// ==================== DELETE GOD IDOL ====================
export const deleteGodIdol = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const godIdol = await GodIdol.findById(id);

    if (!godIdol) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God idol not found"));
    }

    // Delete video from S3
    if (godIdol.video && godIdol.video.key) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: godIdol.video.key,
          }),
        );
        console.log("Video deleted from S3:", godIdol.video.key);
      } catch (err) {
        console.error("Error deleting video from S3:", err);
      }
    }

    await godIdol.deleteOne();

    return res
      .status(200)
      .json(new ApiResponse(200, null, "God idol deleted successfully"));
  } catch (error) {
    return res.status(500).json(new ApiResponse(500, null, error.message));
  }
});

// ==================== GET ALL GOD IDOLS WITH SIGNED URLS ====================
export const getAllGodIdols = asyncHandler(async (req, res) => {
  try {
    const godIdols = await GodIdol.find()
      .populate("godId", "name category")
      .sort({ createdAt: -1 });

    // Generate pre-signed URLs
    const idolsWithUrls = await Promise.all(
      godIdols.map(async (idol) => {
        const idolObj = idol.toObject();

        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: idol.video.key,
          });

          const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600, // 1 hour
          });

          idolObj.video.signedUrl = signedUrl;
        } catch (urlError) {
          console.error(
            "Error generating signed URL for:",
            idol.video.key,
            urlError,
          );
          idolObj.video.signedUrl = null;
        }

        return idolObj;
      }),
    );

    return res
      .status(200)
      .json(
        new ApiResponse(200, idolsWithUrls, "God idols fetched successfully"),
      );
  } catch (error) {
    return res.status(500).json(new ApiResponse(500, null, error.message));
  }
});

// ==================== GET GOD IDOL BY ID WITH SIGNED URL ====================
export const getGodIdolById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const godIdol = await GodIdol.findById(id).populate(
      "godId",
      "name category",
    );

    if (!godIdol) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God idol not found"));
    }

    const idolObj = godIdol.toObject();

    // Generate pre-signed URL
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: godIdol.video.key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      idolObj.video.signedUrl = signedUrl;
    } catch (urlError) {
      console.error("Error generating signed URL:", urlError);
      idolObj.video.signedUrl = null;
    }

    return res
      .status(200)
      .json(new ApiResponse(200, idolObj, "God idol fetched successfully"));
  } catch (error) {
    return res.status(500).json(new ApiResponse(500, null, error.message));
  }
});

// ==================== GET GOD IDOL BY GOD ID ====================
export const getGodIdolByGodId = asyncHandler(async (req, res) => {
  try {
    const { godId } = req.params;
    const godIdol = await GodIdol.findOne({ godId }).populate(
      "godId",
      "name category",
    );

    if (!godIdol) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God idol not found for this god"));
    }

    const idolObj = godIdol.toObject();

    // Generate pre-signed URL
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: godIdol.video.key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      idolObj.video.signedUrl = signedUrl;
    } catch (urlError) {
      console.error("Error generating signed URL:", urlError);
      idolObj.video.signedUrl = null;
    }

    return res
      .status(200)
      .json(new ApiResponse(200, idolObj, "God idol fetched successfully"));
  } catch (error) {
    return res.status(500).json(new ApiResponse(500, null, error.message));
  }
});

// ==================== GET ACTIVE GOD IDOLS ====================
export const getActiveGodIdols = asyncHandler(async (req, res) => {
  try {
    const godIdols = await GodIdol.find({ isActive: true })
      .populate("godId", "name category")
      .sort({ createdAt: -1 });

    // Generate pre-signed URLs
    const idolsWithUrls = await Promise.all(
      godIdols.map(async (idol) => {
        const idolObj = idol.toObject();

        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: idol.video.key,
          });

          const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600,
          });

          idolObj.video.signedUrl = signedUrl;
        } catch (urlError) {
          console.error("Error generating signed URL:", urlError);
          idolObj.video.signedUrl = null;
        }

        return idolObj;
      }),
    );

    return res
      .status(200)
      .json(new ApiResponse(200, idolsWithUrls, "Active god idols fetched"));
  } catch (error) {
    return res.status(500).json(new ApiResponse(500, null, error.message));
  }
});

// ==================== TOGGLE STATUS ====================
export const toggleGodIdolStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const godIdol = await GodIdol.findById(id);

    if (!godIdol) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "God idol not found"));
    }

    godIdol.isActive = !godIdol.isActive;
    await godIdol.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          godIdol,
          `God idol ${godIdol.isActive ? "activated" : "deactivated"}`,
        ),
      );
  } catch (error) {
    return res.status(500).json(new ApiResponse(500, null, error.message));
  }
});
