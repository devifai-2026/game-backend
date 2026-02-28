import express from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  updateCategoryOrder,
  getActiveCategories,
} from "../../controllers/animations/animationCategory.controller.js";

const router = express.Router();

// Public routes
router.get("/active", getActiveCategories);
router.get("/", getAllCategories);
router.get("/:id", getCategoryById);

// Admin routes
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.patch("/:id/toggle", toggleCategoryStatus);
router.patch("/:id/order", updateCategoryOrder);
router.delete("/:id", deleteCategory);

export default router;
