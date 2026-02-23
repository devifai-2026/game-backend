import express from "express";
import {
  createSplash,
  getAllSplash,
  getActiveSplash,
  getSplashById,
  updateSplash,
  deleteSplash,
  toggleSplashStatus,
} from "../../controllers/splash/splash.controller.js";

const router = express.Router();

// ==================== PUBLIC ROUTE ====================
// Get only active splash videos (for mobile app/frontend)
router.get("/active", getActiveSplash);

// ==================== CRUD OPERATIONS ====================
// Create new splash with video upload (multipart/form-data)
router.post("/", createSplash);

// Get all splash videos (admin)
router.get("/", getAllSplash);

// Get single splash by ID
router.get("/:id", getSplashById);

// Update splash (with optional new video) - multipart/form-data
router.put("/:id", updateSplash);

// Delete splash
router.delete("/:id", deleteSplash);

// Toggle active status
router.patch("/:id/toggle", toggleSplashStatus);

export default router;