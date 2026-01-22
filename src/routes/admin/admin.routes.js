import express from "express";
import {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  updateAdminProfile,
  changePassword,
  forgotPassword,
  verifyOtp,
  resetPassword,
  logoutAdmin,
  getAllAdmins,
  updateAdminStatus,
} from "../../controllers/admin/admin.controller.js";
import { verifyAdmin } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

// Protected routes (require admin authentication)
router.get("/profile", verifyAdmin, getAdminProfile);
router.put("/profile", verifyAdmin, updateAdminProfile);
router.put("/change-password", verifyAdmin, changePassword);
router.post("/logout", verifyAdmin, logoutAdmin);

// Admin management routes (super admin only - optional)
router.get("/all", verifyAdmin, getAllAdmins);
router.put("/:id/status", verifyAdmin, updateAdminStatus);

export default router;