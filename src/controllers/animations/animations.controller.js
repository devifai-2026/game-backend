import { 
  s3Client, 
  S3_BUCKET, 
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand 
} from "../../../config/aws.config.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Animation } from "../../models/animations/animation.model.js";
import { GodIdol } from "../../models/godIdol/godIdol.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import busboy from "busboy";
import path from "path";

// ==================== CREATE ANIMATION ====================
export const createAnimation = asyncHandler(async (req, res) => {
  const bb = busboy({ 
    headers: req.headers, 
    limits: { 
      files: 1, 
      fileSize: 100 * 1024 * 1024 // 100MB
    } 
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
  bb.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on('file', (fieldname, fileStream, info) => {
    const { godIdol, category } = fields;
    
    // Validate required fields
    if (!godIdol) {
      uploadError = new Error("godIdol is required");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    if (!category) {
      uploadError = new Error("category is required");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    // Validate category enum
    const validCategories = [
      "pouring_water_milk",
      "flower_showers",
      "lighting_lamp",
      "offerings_fruits_sweets"
    ];
    
    if (!validCategories.includes(category)) {
      uploadError = new Error("Invalid category");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    // Validate ObjectId format
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(godIdol)) {
      uploadError = new Error("Invalid godIdol format - must be a valid MongoDB ObjectId");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    // File type validation
    const { filename, mimeType } = info;
    if (!mimeType.startsWith('video/')) {
      uploadError = new Error("Only video files are allowed");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '-');
    const key = `animations/${category}/${basename}-${timestamp}-${randomString}${ext}`;

    // Collect file data in buffer
    const chunks = [];
    fileStream.on('data', (chunk) => chunks.push(chunk));
    
    fileStream.on('end', async () => {
      try {
        // Check if godIdol exists
        const godIdolExists = await GodIdol.findById(godIdol);
        
        if (!godIdolExists) {
          uploadError = new Error("God idol not found with the provided godIdol");
          fileUploadReject(uploadError);
          return;
        }

        // Check if animation already exists for this godIdol and category
        const existingAnimation = await Animation.findOne({ godIdol, category });
        if (existingAnimation) {
          uploadError = new Error(`Animation already exists for this god idol in category: ${category}`);
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

        console.log("Animation video uploaded successfully:", key);
        fileUploadResolve();
      } catch (error) {
        console.error("S3 upload error:", error);
        uploadError = error;
        fileUploadReject(error);
      }
    });

    fileStream.on('error', (error) => {
      uploadError = error;
      fileUploadReject(error);
    });
  });

  // Handle finish event
  bb.on('finish', async () => {
    if (responseSent) return;

    try {
      // Wait for file upload to complete
      await fileUploadPromise;

      if (uploadError) {
        responseSent = true;
        return res.status(400).json(
          new ApiResponse(400, null, uploadError.message)
        );
      }

      const { godIdol, category, title, order, isActive } = fields;

      // Create animation in database
      const animation = await Animation.create({
        godIdol,
        category,
        title,
        video: {
          key: videoFile.key,
          url: videoFile.url,
          filename: videoFile.filename,
          size: videoFile.size,
          uploadedAt: new Date(),
        },
        order: order ? parseInt(order) : 0,
        isActive: isActive === 'true' || isActive === true,
      });

      responseSent = true;
      return res.status(201).json(
        new ApiResponse(201, animation, "Animation created successfully")
      );
      
    } catch (error) {
      // Cleanup if database error occurs
      if (videoFile?.key) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: videoFile.key,
          }));
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }
      }

      responseSent = true;
      return res.status(500).json(
        new ApiResponse(500, null, error.message || "File upload failed")
      );
    }
  });

  // Handle busboy error
  bb.on('error', (error) => {
    if (responseSent) return;
    responseSent = true;
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  });

  // Pipe the request to busboy
  req.pipe(bb);
});

// ==================== UPDATE ANIMATION ====================
export const updateAnimation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Find existing animation
  const animation = await Animation.findById(id);
  if (!animation) {
    return res.status(404).json(
      new ApiResponse(404, null, "Animation not found")
    );
  }

  const bb = busboy({ 
    headers: req.headers, 
    limits: { 
      files: 1, 
      fileSize: 100 * 1024 * 1024 
    } 
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

  bb.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on('file', (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;

    if (!mimeType.startsWith('video/')) {
      uploadError = new Error("Only video files are allowed");
      fileStream.resume();
      fileUploadReject(uploadError);
      return;
    }

    const { category } = fields;
    const categoryPath = category || animation.category;
    
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '-');
    const key = `animations/${categoryPath}/${basename}-${timestamp}-${randomString}${ext}`;

    const chunks = [];
    fileStream.on('data', (chunk) => chunks.push(chunk));
    
    fileStream.on('end', async () => {
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

        console.log("New animation video uploaded successfully:", key);
        fileUploadResolve();
      } catch (error) {
        console.error("S3 upload error:", error);
        uploadError = error;
        fileUploadReject(error);
      }
    });

    fileStream.on('error', (error) => {
      uploadError = error;
      fileUploadReject(error);
    });
  });

  bb.on('finish', async () => {
    if (responseSent) return;

    try {
      // Only wait for file upload if there was a file
      if (Object.keys(fields).length > 0 || videoFile) {
        await fileUploadPromise;
      }

      if (uploadError) {
        responseSent = true;
        return res.status(500).json(
          new ApiResponse(500, null, uploadError.message)
        );
      }

      const { godIdol, category, title, order, isActive } = fields;

      // Check for unique constraint if godIdol or category is being changed
      if ((godIdol || category) && 
          (godIdol !== animation.godIdol.toString() || 
           (category && category !== animation.category))) {
        
        const newGodIdol = godIdol || animation.godIdol;
        const newCategory = category || animation.category;
        
        const existing = await Animation.findOne({ 
          godIdol: newGodIdol, 
          category: newCategory,
          _id: { $ne: id }
        });
        
        if (existing) {
          if (videoFile?.key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: videoFile.key,
            }));
          }

          responseSent = true;
          return res.status(409).json(
            new ApiResponse(409, null, `Animation already exists for this god idol in category: ${newCategory}`)
          );
        }
      }

      // Update fields
      if (godIdol) animation.godIdol = godIdol;
      if (category) animation.category = category;
      if (title) animation.title = title;
      if (order !== undefined) animation.order = parseInt(order);
      if (isActive !== undefined) animation.isActive = isActive === 'true' || isActive === true;
      
      // If new video uploaded
      if (videoFile) {
        // Delete old video from S3
        if (animation.video.key) {
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: animation.video.key,
            }));
            console.log("Old video deleted from S3:", animation.video.key);
          } catch (err) {
            console.error("Error deleting old video:", err);
          }
        }
        
        // Update with new video
        animation.video = {
          key: videoFile.key,
          url: videoFile.url,
          filename: videoFile.filename,
          size: videoFile.size,
          uploadedAt: new Date(),
        };
      }

      await animation.save();

      responseSent = true;
      return res.status(200).json(
        new ApiResponse(200, animation, "Animation updated successfully")
      );
    } catch (error) {
      responseSent = true;
      return res.status(500).json(
        new ApiResponse(500, null, error.message || "Update failed")
      );
    }
  });

  bb.on('error', (error) => {
    if (responseSent) return;
    responseSent = true;
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  });

  req.pipe(bb);
});

// ==================== DELETE ANIMATION ====================
export const deleteAnimation = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const animation = await Animation.findById(id);
    
    if (!animation) {
      return res.status(404).json(
        new ApiResponse(404, null, "Animation not found")
      );
    }

    // Delete video from S3
    if (animation.video && animation.video.key) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: animation.video.key,
        }));
        console.log("Video deleted from S3:", animation.video.key);
      } catch (err) {
        console.error("Error deleting video from S3:", err);
      }
    }

    await animation.deleteOne();
    
    return res.status(200).json(
      new ApiResponse(200, null, "Animation deleted successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET ALL ANIMATIONS ====================
export const getAllAnimations = asyncHandler(async (req, res) => {
  try {
    const animations = await Animation.find()
      .populate({
        path: 'godIdol',
        populate: {
          path: 'godId',
          select: 'name category'
        }
      })
      .sort({ order: 1, createdAt: -1 });
    
    // Generate pre-signed URLs
    const animationsWithUrls = await Promise.all(
      animations.map(async (anim) => {
        const animObj = anim.toObject();
        
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: anim.video.key,
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600 // 1 hour
          });
          
          animObj.video.signedUrl = signedUrl;
          
        } catch (urlError) {
          console.error("Error generating signed URL for:", anim.video.key, urlError);
          animObj.video.signedUrl = null;
        }
        
        return animObj;
      })
    );
    
    return res.status(200).json(
      new ApiResponse(200, animationsWithUrls, "Animations fetched successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET ANIMATION BY ID ====================
export const getAnimationById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const animation = await Animation.findById(id)
      .populate({
        path: 'godIdol',
        populate: {
          path: 'godId',
          select: 'name category'
        }
      });
    
    if (!animation) {
      return res.status(404).json(
        new ApiResponse(404, null, "Animation not found")
      );
    }
    
    const animObj = animation.toObject();
    
    // Generate pre-signed URL
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: animation.video.key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, command, { 
        expiresIn: 3600 
      });
      
      animObj.video.signedUrl = signedUrl;
    } catch (urlError) {
      console.error("Error generating signed URL:", urlError);
      animObj.video.signedUrl = null;
    }
    
    return res.status(200).json(
      new ApiResponse(200, animObj, "Animation fetched successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET ANIMATIONS BY GOD IDOL ====================
export const getAnimationsByGodIdol = asyncHandler(async (req, res) => {
  try {
    const { godIdolId } = req.params;
    
    const animations = await Animation.find({ godIdol: godIdolId })
      .populate({
        path: 'godIdol',
        populate: {
          path: 'godId',
          select: 'name category'
        }
      })
      .sort({ order: 1, category: 1 });
    
    // Generate pre-signed URLs
    const animationsWithUrls = await Promise.all(
      animations.map(async (anim) => {
        const animObj = anim.toObject();
        
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: anim.video.key,
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600
          });
          
          animObj.video.signedUrl = signedUrl;
        } catch (urlError) {
          console.error("Error generating signed URL:", urlError);
          animObj.video.signedUrl = null;
        }
        
        return animObj;
      })
    );
    
    return res.status(200).json(
      new ApiResponse(200, animationsWithUrls, "Animations fetched successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET ANIMATIONS BY CATEGORY ====================
export const getAnimationsByCategory = asyncHandler(async (req, res) => {
  try {
    const { categoryId } = req.params; 
    
    const animations = await Animation.find({ category: categoryId, isActive: true })
      .populate({
        path: 'godIdol',
        populate: {
          path: 'godId',
          select: 'name'
        }
      })
      .populate('category', 'name icon') 
      .sort({ order: 1 });
    
    // Generate pre-signed URLs
    const animationsWithUrls = await Promise.all(
      animations.map(async (anim) => {
        const animObj = anim.toObject();
        
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: anim.video.key,
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600
          });
          
          animObj.video.signedUrl = signedUrl;
        } catch (urlError) {
          console.error("Error generating signed URL:", urlError);
          animObj.video.signedUrl = null;
        }
        
        return animObj;
      })
    );
    
    return res.status(200).json(
      new ApiResponse(200, animationsWithUrls, "Animations fetched successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== TOGGLE ANIMATION STATUS ====================
export const toggleAnimationStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const animation = await Animation.findById(id);
    
    if (!animation) {
      return res.status(404).json(
        new ApiResponse(404, null, "Animation not found")
      );
    }

    animation.isActive = !animation.isActive;
    await animation.save();

    return res.status(200).json(
      new ApiResponse(200, animation, `Animation ${animation.isActive ? 'activated' : 'deactivated'}`)
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== UPDATE ORDER ====================
export const updateAnimationOrder = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;
    
    if (order === undefined || order < 0) {
      return res.status(400).json(
        new ApiResponse(400, null, "Valid order number is required")
      );
    }
    
    const animation = await Animation.findById(id);
    
    if (!animation) {
      return res.status(404).json(
        new ApiResponse(404, null, "Animation not found")
      );
    }

    animation.order = order;
    await animation.save();

    return res.status(200).json(
      new ApiResponse(200, animation, "Animation order updated successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

