import express from "express";
import {
  createAnimation,
  getAllAnimations,
  getActiveAnimations,
  getAnimationById,
  getAnimationByCategory,
  updateAnimation,
  updateAnimationOrder,
  deleteAnimation,
  toggleAnimationStatus,
} from "../../controllers/animations/animations.controller.js";

const router = express.Router();

router.get("/active", getActiveAnimations);
router.get("/category/:category", getAnimationByCategory);
router.get("/:id", getAnimationById);
router.get("/", getAllAnimations);

router.post("/", createAnimation);
router.put("/:id", updateAnimation);
router.delete("/:id", deleteAnimation);
router.patch("/:id/toggle", toggleAnimationStatus);
router.patch("/order/update", updateAnimationOrder);

export default router;
