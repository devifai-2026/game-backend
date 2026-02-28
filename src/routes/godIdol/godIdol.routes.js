import express from "express";
import {
  createGodIdol,
  getAllGodIdols,
  getActiveGodIdols,
  getGodIdolById,
  getGodIdolByGodId,
  updateGodIdol,
  deleteGodIdol,
  toggleGodIdolStatus,
  createGodIdolWithAnimation,
} from "../../controllers/godIdol/godIdol.controller.js";

const router = express.Router();

// Public routes
router.get("/active", getActiveGodIdols);
router.get("/god/:godId", getGodIdolByGodId); // Get by God ID

// CRUD operations
router.post("/", createGodIdol);
router.post("/with-animation", createGodIdolWithAnimation);
router.get("/", getAllGodIdols);
router.get("/:id", getGodIdolById);
router.put("/:id", updateGodIdol);
router.delete("/:id", deleteGodIdol);
router.patch("/:id/toggle", toggleGodIdolStatus);

export default router;
