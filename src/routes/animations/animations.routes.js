import express from "express";
import {
  uploadAnimationZip,
  getAllAnimations,
  getActiveAnimations,
  getAnimationById,
  getAnimationByCategory,
  createAnimation,
  updateAnimation,
  deleteAnimation,
  toggleAnimationStatus,
} from "../../controllers/animations/animations.controller.js";

const router = express.Router();

// Upload route
router.post("/upload-zip", uploadAnimationZip);

// Public routes
router.get("/active", getActiveAnimations);
router.get("/category/:category", getAnimationByCategory);

// CRUD routes
router.get("/", getAllAnimations);
router.get("/:id", getAnimationById);
router.post("/", createAnimation);
router.put("/:id", updateAnimation);
router.delete("/:id", deleteAnimation);
router.patch("/:id/toggle", toggleAnimationStatus);

export default router;