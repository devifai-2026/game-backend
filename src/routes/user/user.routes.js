import express from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  forgotUserPassword,
  verifyUserOtp,
  resetUserPassword,
  logoutUser,
  uploadToGallery,
  getUserGallery,
  deleteFromGallery,
  refreshUserToken,
} from "../../controllers/user/userController.js";
import { verifyUser } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotUserPassword);
router.post("/verify-otp", verifyUserOtp);
router.post("/reset-password", resetUserPassword);
router.post("/refresh-token", refreshUserToken);

// Protected routes (require user authentication)
router.get("/profile", verifyUser, getUserProfile);
router.put("/profile", verifyUser, updateUserProfile);
router.put("/change-password", verifyUser, changeUserPassword);
router.post("/logout", verifyUser, logoutUser);

// Gallery routes
router.post("/gallery", verifyUser, uploadToGallery);
router.get("/gallery", verifyUser, getUserGallery);
router.delete("/gallery/:imageId", verifyUser, deleteFromGallery);

export default router;