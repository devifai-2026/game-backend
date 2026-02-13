import { s3Client, S3_BUCKET } from "../../../config/aws.config.js";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { God } from "../../models/god/god.model.js";
import { GodIdol } from "../../models/godIdol/godIdol.model.js";
import yauzl from "yauzl";
import path from "path";
import busboy from "busboy";

// ==================== UPLOAD SECTION (Same as before) ====================

export const uploadAndProcessZip = async (req, res) => {
  try {
    const bb = busboy({ headers: req.headers });
    let godId = null;
    let god = null;
    let godIdol = null;
    let zipBuffer = null;
    let responseSent = false;

    const sendResponse = (statusCode, data) => {
      if (!responseSent) {
        responseSent = true;
        res.status(statusCode).json(data);
      }
    };

    bb.on("field", (name, val) => {
      if (name === "godId") godId = val;
    });

    bb.on("file", (name, file, info) => {
      const { filename } = info;

      if (!filename.endsWith(".zip")) {
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

    bb.on("close", async () => {
      try {
        if (!godId) {
          return sendResponse(400, { error: "godId required" });
        }

        if (!zipBuffer) {
          return sendResponse(400, { error: "No file uploaded" });
        }

        god = await God.findById(godId);
        if (!god) {
          return sendResponse(404, { error: "God not found" });
        }

        const folderName = god.name.toLowerCase().replace(/\s+/g, "-");
        godIdol = await GodIdol.findOne({ godId });

        if (!godIdol) {
          godIdol = new GodIdol({
            godId,
            folderName,
            images: [],
            totalImages: 0,
          });
        } else {
          godIdol.images = [];
          godIdol.totalImages = 0;
        }

        console.log("📦 Processing ZIP file...");
        const images = await processZipBuffer(zipBuffer, folderName, S3_BUCKET);

        godIdol.images = images;
        godIdol.totalImages = images.length;
        await godIdol.save();

        console.log(`✅ Successfully processed ${images.length} images`);

        sendResponse(200, {
          success: true,
          message: `Processed ${images.length} images`,
          godIdol,
        });
      } catch (error) {
        console.error("❌ Processing error:", error);
        sendResponse(500, { error: error.message });
      }
    });

    bb.on("error", (err) => {
      console.error("Busboy error:", err);
      sendResponse(500, { error: "Upload processing failed" });
    });

    req.pipe(bb);
  } catch (error) {
    console.error("❌ Upload error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
};

// Process ZIP buffer and upload to S3
async function processZipBuffer(zipBuffer, folderName, bucket) {
  return new Promise((resolve, reject) => {
    const images = [];
    let processedCount = 0;

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error("❌ Failed to open ZIP:", err);
        return reject(err);
      }

      zipfile.readEntry();

      zipfile.on("entry", (entry) => {
        const ext = path.extname(entry.fileName).toLowerCase();
        const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(
          ext,
        );

        if (
          !isImage ||
          entry.fileName.startsWith("__MACOSX") ||
          entry.fileName.startsWith(".")
        ) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, async (err, readStream) => {
          if (err) {
            console.error(`❌ Error reading ${entry.fileName}:`, err);
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
              const s3Key = `godIdol/${folderName}/${orderNumber}_${cleanFileName}`;

              // Upload to S3
              await s3Client.send(
                new PutObjectCommand({
                  Bucket: bucket,
                  Key: s3Key,
                  Body: imageBuffer,
                  ContentType: `image/${ext.replace(".", "")}`,
                  CacheControl: "public, max-age=31536000",
                }),
              );

              // Store the S3 key, NOT the public URL
              images.push({
                key: s3Key, // Only store the key, not the public URL
                order: processedCount + 1,
                filename: cleanFileName,
                size: imageBuffer.length,
                uploadedAt: new Date(),
              });

              processedCount++;
              console.log(`✅ Uploaded (${processedCount}): ${cleanFileName}`);

              zipfile.readEntry();
            } catch (error) {
              console.error(`❌ Upload error for ${entry.fileName}:`, error);
              zipfile.readEntry();
            }
          });

          readStream.on("error", (streamError) => {
            console.error(
              `❌ Stream error for ${entry.fileName}:`,
              streamError,
            );
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        images.sort((a, b) => a.order - b.order);
        console.log(
          `🎉 ZIP processing complete: ${images.length} images processed`,
        );
        resolve(images);
      });

      zipfile.on("error", (zipError) => {
        console.error("❌ ZIP error:", zipError);
        reject(zipError);
      });
    });
  });
}

// ==================== PRESIGNED URL FUNCTIONS ====================

/**
 * Generate a presigned URL for a single S3 key
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiry time in seconds (default: 3600 = 1 hour)
 */
export const generatePresignedUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw error;
  }
};

/**
 * Get presigned URL for a single image by its ID
 */
export const getPresignedImageUrl = async (req, res) => {
  try {
    const { imageId } = req.params;
    const { expiresIn = 3600 } = req.query; // Optional expiry parameter

    // Find the image across all GodIdol documents
    const godIdol = await GodIdol.findOne({ "images._id": imageId });
    
    if (!godIdol) {
      return res.status(404).json({ error: "Image not found" });
    }

    const image = godIdol.images.id(imageId);
    
    if (!image || !image.key) {
      return res.status(404).json({ error: "Image key not found" });
    }

    // Generate presigned URL
    const url = await generatePresignedUrl(image.key, parseInt(expiresIn));

    res.json({
      success: true,
      url,
      key: image.key,
      expiresIn: parseInt(expiresIn),
      expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
    });

  } catch (error) {
    console.error("❌ Error generating presigned URL:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get images with presigned URLs (modified version of getGodIdolImages)
 */
export const getGodIdolImagesWithUrls = async (req, res) => {
  try {
    const { godId } = req.params;
    const { expiresIn = 3600 } = req.query; // Optional expiry parameter

    if (!godId) {
      return res.status(400).json({ error: "godId is required" });
    }

    const god = await God.findById(godId);
    if (!god) {
      return res.status(404).json({ error: "God not found" });
    }

    const godIdol = await GodIdol.findOne({ godId });

    if (!godIdol) {
      return res.status(404).json({
        error: "No images found for this god",
        godId,
        godName: god.name,
      });
    }

    // Sort images by order
    const sortedImages = godIdol.images.sort((a, b) => a.order - b.order);

    // Generate presigned URLs for all images
    const imagesWithUrls = await Promise.all(
      sortedImages.map(async (img) => {
        const url = await generatePresignedUrl(img.key, parseInt(expiresIn));
        return {
          id: img._id,
          url, // This is the presigned URL
          key: img.key,
          order: img.order,
          filename: img.filename,
          size: img.size,
          uploadedAt: img.uploadedAt || img.createdAt,
        };
      })
    );

    const response = {
      success: true,
      god: {
        id: god._id,
        name: god.name,
        image: god.image,
        description: god.description,
      },
      folderName: godIdol.folderName,
      totalImages: godIdol.totalImages,
      images: imagesWithUrls,
      urlExpiry: {
        expiresIn: parseInt(expiresIn),
        expiresAt: new Date(Date.now() + parseInt(expiresIn) * 1000),
      },
      metadata: {
        totalCount: godIdol.totalImages,
        returnedCount: sortedImages.length,
        lastUpdated: godIdol.updatedAt,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("❌ Error fetching god idol images:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get paginated images with presigned URLs
 */
export const getGodIdolImagesPaginatedWithUrls = async (req, res) => {
  try {
    const { godId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const expiresIn = parseInt(req.query.expiresIn) || 3600;
    const skip = (page - 1) * limit;

    const god = await God.findById(godId);
    if (!god) {
      return res.status(404).json({ error: "God not found" });
    }

    const godIdol = await GodIdol.findOne({ godId });

    if (!godIdol) {
      return res.status(404).json({ error: "No images found" });
    }

    // Get paginated images
    const totalImages = godIdol.images.length;
    const paginatedImages = godIdol.images
      .sort((a, b) => a.order - b.order)
      .slice(skip, skip + limit);

    // Generate presigned URLs for paginated images
    const imagesWithUrls = await Promise.all(
      paginatedImages.map(async (img) => {
        const url = await generatePresignedUrl(img.key, expiresIn);
        return {
          id: img._id,
          url,
          key: img.key,
          order: img.order,
          filename: img.filename,
          size: img.size,
        };
      })
    );

    res.status(200).json({
      success: true,
      god: {
        id: god._id,
        name: god.name,
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
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Batch generate presigned URLs for multiple keys
 */
export const batchGeneratePresignedUrls = async (req, res) => {
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
    console.error("❌ Error generating batch URLs:", error);
    res.status(500).json({ error: error.message });
  }
};