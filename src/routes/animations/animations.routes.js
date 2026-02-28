import { Router } from "express";
import {
  createAnimation,
  updateAnimation,
  deleteAnimation,
  getAllAnimations,
  getAnimationById,
  getAnimationsByGodIdol,
  getAnimationsByCategory,
  toggleAnimationStatus,
  updateAnimationOrder,
} from "../../controllers/animations/animations.controller.js";

const router = Router();

// ==================== PUBLIC ROUTES ====================
// Get all animations (with optional filtering)
router.get("/", getAllAnimations);

// Get animation by ID
router.get("/:id", getAnimationById);

// Get animations by god idol ID
router.get("/godIdol/:godIdolId", getAnimationsByGodIdol);

// Get animations by category
router.get("/category/:category", getAnimationsByCategory);


// Create new animation
router.post("/", createAnimation);

// Update animation
router.put("/:id", updateAnimation);

// Delete animation
router.delete("/:id", deleteAnimation);

// Toggle animation status
router.patch("/:id/toggle-status", toggleAnimationStatus);

// Update animation order
router.patch("/:id/order", updateAnimationOrder);

export default router;