import express from "express";
import {
  createSplash,
  getAllSplash,
  getActiveSplash,
  updateSplash,
  updateSplashOrder,
  deleteSplash,
  toggleSplashStatus,
} from "../../controllers/splash/splash.controller.js";

const router = express.Router();

router.get("/active", getActiveSplash);

router.post("/", createSplash);
router.get("/", getAllSplash);
router.put("/:id", updateSplash);
router.delete("/:id", deleteSplash);
router.patch("/:id/toggle", toggleSplashStatus);
router.patch("/order/update", updateSplashOrder);

export default router;
