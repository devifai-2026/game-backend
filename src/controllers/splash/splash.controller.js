import { 
  s3Client, 
  S3_BUCKET, 
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand 
} from "../../../config/aws.config.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Splash } from "../../models/splash/splash.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import busboy from "busboy";
import path from "path";

// ==================== CREATE WITH DIRECT S3 UPLOAD ====================
export const createSplash = asyncHandler(async (req, res) => {
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
  let fileUploadPromise = null;
  let fileUploadResolve = null;
  let fileUploadReject = null;

  // Check total splash count
  const totalSplash = await Splash.countDocuments();
  if (totalSplash >= 4) {
    return res.status(400).json(
      new ApiResponse(400, null, "Maximum 4 splash videos allowed")
    );
  }

  // Create a new promise for file upload
  fileUploadPromise = new Promise((resolve, reject) => {
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

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '-');
    const key = `splash/${basename}-${timestamp}-${randomString}${ext}`;

    // Collect file data in buffer
    const chunks = [];
    fileStream.on('data', (chunk) => chunks.push(chunk));
    
    fileStream.on('end', async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);
        
        // Use PutObjectCommand for upload
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

        console.log("Video uploaded successfully:", key);
        fileUploadResolve(); // Resolve the promise when upload is complete
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
      // Wait for file upload to complete
      if (fileUploadPromise) {
        await fileUploadPromise;
      }

      // Check for upload errors after waiting
      if (uploadError) {
        responseSent = true;
        return res.status(500).json(
          new ApiResponse(500, null, uploadError.message)
        );
      }

      console.log("Received fields:", fields);
      console.log("Video file:", videoFile);

      const { serialNo, isActive, order } = fields;

      if (!serialNo || !videoFile) {
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
        return res.status(400).json(
          new ApiResponse(400, null, "serialNo and video file are required")
        );
      }

      // Check duplicate serial number
      const existingSplash = await Splash.findOne({ serialNo: parseInt(serialNo) });
      if (existingSplash) {
        // Clean up uploaded video
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: videoFile.key,
          }));
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }

        responseSent = true;
        return res.status(409).json(
          new ApiResponse(409, null, "Serial number already exists")
        );
      }

      try {
        const splash = await Splash.create({
          video: {
            key: videoFile.key,
            url: videoFile.url,
            filename: videoFile.filename,
            size: videoFile.size,
            uploadedAt: new Date(),
          },
          serialNo: parseInt(serialNo),
          isActive: isActive === 'true' || isActive === true,
          order: order ? parseInt(order) : parseInt(serialNo),
        });

        responseSent = true;
        return res.status(201).json(
          new ApiResponse(201, splash, "Splash created successfully")
        );
      } catch (dbError) {
        // Clean up if DB save fails
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: videoFile.key,
          }));
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }

        responseSent = true;
        return res.status(500).json(
          new ApiResponse(500, null, dbError.message)
        );
      }
    } catch (error) {
      // Handle file upload promise rejection
      responseSent = true;
      return res.status(500).json(
        new ApiResponse(500, null, error.message || "File upload failed")
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

  // Pipe the request to busboy
  req.pipe(bb);
});

// ==================== UPDATE WITH DIRECT S3 UPLOAD ====================
export const updateSplash = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Find existing splash
  const splash = await Splash.findById(id);
  if (!splash) {
    return res.status(404).json(
      new ApiResponse(404, null, "Splash not found")
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
  
  // Create a promise to track file upload completion
  let fileUploadPromise = null;
  let fileUploadResolve = null;
  let fileUploadReject = null;

  // Create a new promise for file upload
  fileUploadPromise = new Promise((resolve, reject) => {
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

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '-');
    const key = `splash/${basename}-${timestamp}-${randomString}${ext}`;

    // Collect file data in buffer
    const chunks = [];
    fileStream.on('data', (chunk) => chunks.push(chunk));
    
    fileStream.on('end', async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);
        
        // Use PutObjectCommand for upload
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

        console.log("Video uploaded successfully:", key);
        fileUploadResolve(); // Resolve the promise when upload is complete
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
      // Wait for file upload to complete
      if (fileUploadPromise) {
        await fileUploadPromise;
      }

      if (uploadError) {
        responseSent = true;
        return res.status(500).json(
          new ApiResponse(500, null, uploadError.message)
        );
      }

      const { serialNo, isActive, order } = fields;

      // Check serial number conflict
      if (serialNo && parseInt(serialNo) !== splash.serialNo) {
        const existing = await Splash.findOne({ serialNo: parseInt(serialNo) });
        if (existing) {
          // Clean up newly uploaded video if any
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
          return res.status(409).json(
            new ApiResponse(409, null, "Serial number already exists")
          );
        }
        splash.serialNo = parseInt(serialNo);
      }

      // If new video uploaded
      if (videoFile) {
        // Delete old video from S3
        if (splash.video.key) {
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: splash.video.key,
            }));
            console.log("Old video deleted from S3:", splash.video.key);
          } catch (err) {
            console.error("Error deleting old video:", err);
            // Continue even if delete fails
          }
        }
        
        // Update with new video
        splash.video = {
          key: videoFile.key,
          url: videoFile.url,
          filename: videoFile.filename,
          size: videoFile.size,
          uploadedAt: new Date(),
        };
      }
      
      // Update other fields
      if (isActive !== undefined) splash.isActive = isActive === 'true' || isActive === true;
      if (order !== undefined) splash.order = parseInt(order);

      await splash.save();

      responseSent = true;
      return res.status(200).json(
        new ApiResponse(200, splash, "Splash updated successfully")
      );
    } catch (error) {
      responseSent = true;
      return res.status(500).json(
        new ApiResponse(500, null, error.message || "File upload failed")
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

  // Pipe the request to busboy
  req.pipe(bb);
});

// ==================== DELETE ====================
export const deleteSplash = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const splash = await Splash.findById(id);
    
    if (!splash) {
      return res.status(404).json(
        new ApiResponse(404, null, "Splash not found")
      );
    }

    // Delete video from S3
    if (splash.video && splash.video.key) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: splash.video.key,
        }));
        console.log("Video deleted from S3:", splash.video.key);
      } catch (err) {
        console.error("Error deleting video from S3:", err);
        // Continue even if S3 deletion fails
      }
    }

    await splash.deleteOne();
    
    return res.status(200).json(
      new ApiResponse(200, null, "Splash deleted successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET ALL WITH SIGNED URLS ====================
export const getAllSplash = asyncHandler(async (req, res) => {
  try {
    const splashScreens = await Splash.find().sort({ order: 1, serialNo: 1 });
    
    // Generate pre-signed URLs for each video
    const splashWithUrls = await Promise.all(
      splashScreens.map(async (splash) => {
        const splashObj = splash.toObject();
        
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: splash.video.key,
          });
          
          // Generate URL that expires in 1 hour
          const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600 // 1 hour in seconds
          });
          
          // Add signed URL and remove original URL
          splashObj.video.signedUrl = signedUrl;
          // splashObj.video.url = undefined; // optionally remove original URL
          
        } catch (urlError) {
          console.error("Error generating signed URL for:", splash.video.key, urlError);
          splashObj.video.signedUrl = null;
        }
        
        return splashObj;
      })
    );
    
    return res.status(200).json(
      new ApiResponse(200, splashWithUrls, "Splash fetched successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET BY ID WITH SIGNED URL ====================
export const getSplashById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const splash = await Splash.findById(id);
    
    if (!splash) {
      return res.status(404).json(
        new ApiResponse(404, null, "Splash not found")
      );
    }
    
    const splashObj = splash.toObject();
    
    // Generate pre-signed URL
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: splash.video.key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, command, { 
        expiresIn: 3600 
      });
      
      splashObj.video.signedUrl = signedUrl;
    } catch (urlError) {
      console.error("Error generating signed URL:", urlError);
      splashObj.video.signedUrl = null;
    }
    
    return res.status(200).json(
      new ApiResponse(200, splashObj, "Splash fetched successfully")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== GET ACTIVE WITH SIGNED URLS ====================
export const getActiveSplash = asyncHandler(async (req, res) => {
  try {
    const splashScreens = await Splash.find({ isActive: true }).sort({ order: 1, serialNo: 1 });
    
    // Generate pre-signed URLs for each video
    const splashWithUrls = await Promise.all(
      splashScreens.map(async (splash) => {
        const splashObj = splash.toObject();
        
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: splash.video.key,
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600 // 1 hour
          });
          
          splashObj.video.signedUrl = signedUrl;
          
        } catch (urlError) {
          console.error("Error generating signed URL:", urlError);
          splashObj.video.signedUrl = null;
        }
        
        return splashObj;
      })
    );
    
    return res.status(200).json(
      new ApiResponse(200, splashWithUrls, "Active splash fetched")
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});

// ==================== TOGGLE STATUS ====================
export const toggleSplashStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const splash = await Splash.findById(id);
    
    if (!splash) {
      return res.status(404).json(
        new ApiResponse(404, null, "Splash not found")
      );
    }

    splash.isActive = !splash.isActive;
    await splash.save();

    return res.status(200).json(
      new ApiResponse(200, splash, `Splash ${splash.isActive ? 'activated' : 'deactivated'}`)
    );
  } catch (error) {
    return res.status(500).json(
      new ApiResponse(500, null, error.message)
    );
  }
});