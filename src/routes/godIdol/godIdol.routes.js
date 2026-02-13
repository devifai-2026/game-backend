import express from "express";
import { 
  uploadAndProcessZip,
  getGodIdolImagesWithUrls,
  getGodIdolImagesPaginatedWithUrls,
//   getSingleImage,
  getPresignedImageUrl,
  batchGeneratePresignedUrls
} from "../../controllers/godIdol/godIdol.controller.js";

const router = express.Router();

// Upload route
router.post("/upload-zip", uploadAndProcessZip);

// Presigned URL routes (RECOMMENDED - bucket can stay private)
router.get('/:godId/images', getGodIdolImagesWithUrls);
router.get('/:godId/images/paginated', getGodIdolImagesPaginatedWithUrls);
router.get('/presigned/:imageId', getPresignedImageUrl);
router.post('/presigned/batch', batchGeneratePresignedUrls);

// Keep single image route if needed (but it will use the stored URL)
// router.get('/:godId/images/:imageId', getSingleImage);

export default router;