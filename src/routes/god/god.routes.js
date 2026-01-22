import express from "express";
import {
  createGod,
  getAllGods,
  getGodById,
  updateGod,
  deleteGod,
  searchGods,
} from "../../controllers/god/god.controller.js";

const router = express.Router();

router.get("/", getAllGods);
router.get("/search", searchGods);
router.get("/:id", getGodById);

router.post("/", createGod);
router.put("/:id", updateGod);
router.delete("/:id", deleteGod);

export default router;
