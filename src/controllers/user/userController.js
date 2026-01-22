import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../../models/user/user.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";
import sendEmail from "../../utils/sendEmail.js";

// Register user
export const registerUser = asyncHandler(async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "All fields are required"));
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid email format"));
    }

    // Validate password strength
    if (password.length < 6) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Password must be at least 6 characters")
        );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "User already exists"));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
    });

    // Remove sensitive data from response
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Send welcome email
    const welcomeHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Vedic!</h2>
        <p>Hello ${user.name},</p>
        <p>Thank you for registering with us. Your account has been created successfully.</p>
        <p>You can now log in to your account and explore our courses.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #777; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: "Welcome to Vedic - Registration Successful",
        html: welcomeHtml,
      });
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
      // Don't fail registration if email fails
    }

    return res
      .status(201)
      .json(new ApiResponse(201, userResponse, "User registered successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Login user
export const loginUser = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email and password are required"));
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid email or password"));
    }

    // Check if account is active
    if (!user.isActive) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, null, "Account is deactivated. Contact support.")
        );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid email or password"));
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: "user",
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "24h",
      }
    );

    // Prepare response data
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
      token,
    };

    return res
      .status(200)
      .json(new ApiResponse(200, userData, "Login successful"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get user profile
export const getUserProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -otp -otpExpires"
    );

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user, "Profile fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Update user profile
export const updateUserProfile = asyncHandler(async (req, res) => {
  try {
    const { name, phone } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "No data provided for update"));
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -otp -otpExpires");

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user, "Profile updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Change password
export const changeUserPassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Both passwords are required"));
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "New password must be at least 6 characters")
        );
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Current password is incorrect"));
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    user.password = hashedNewPassword;
    await user.save();

    // Send password change notification email
    const notificationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Changed Successfully</h2>
        <p>Hello ${user.name},</p>
        <p>Your password has been changed successfully.</p>
        <p>If you did not make this change, please contact our support team immediately.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #777; font-size: 12px;">This is an automated security notification.</p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: "Password Changed - Vedic Account",
        html: notificationHtml,
      });
    } catch (emailError) {
      console.error("Failed to send password change email:", emailError);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Password changed successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Forgot password
export const forgotUserPassword = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email is required"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Return success even if user not found (security best practice)
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            null,
            "If an account exists with this email, you will receive a password reset OTP"
          )
        );
    }

    // Check if account is active
    if (!user.isActive) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, null, "Account is deactivated. Contact support.")
        );
    }

    // Check OTP attempts limit
    if (user.otpAttempts >= 5) {
      return res
        .status(429)
        .json(
          new ApiResponse(
            429,
            null,
            "Too many OTP attempts. Please try again later."
          )
        );
    }

    // Check time since last OTP
    const now = new Date();
    if (user.lastOtpSent) {
      const timeDiff = now - user.lastOtpSent;
      const minutesDiff = timeDiff / (1000 * 60);
      if (minutesDiff < 2) {
        // 2-minute cooldown
        return res
          .status(429)
          .json(
            new ApiResponse(
              429,
              null,
              "Please wait before requesting another OTP"
            )
          );
      }
    }

    // Generate OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    // Update user with OTP
    user.otp = otp;
    user.otpExpires = otpExpires;
    user.otpAttempts = user.otpAttempts + 1;
    user.lastOtpSent = now;
    await user.save();

    // Send OTP via email
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>You have requested to reset your password. Use the following OTP to proceed:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; margin: 20px 0; font-size: 24px; letter-spacing: 5px;">
          <strong>${otp}</strong>
        </div>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #777; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: "Password Reset OTP - Vedic",
      html,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, null, "OTP sent to your email"));
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to process forgot password request")
      );
  }
});

// Verify OTP
export const verifyUserOtp = asyncHandler(async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email and OTP are required"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otpExpires) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "No OTP found or OTP expired"));
    }

    const now = new Date();
    if (now > user.otpExpires) {
      // Clear expired OTP
      user.otp = null;
      user.otpExpires = null;
      await user.save();

      return res
        .status(400)
        .json(new ApiResponse(400, null, "OTP has expired"));
    }

    // Verify OTP
    if (user.otp !== otp) {
      // Increment OTP attempts
      user.otpAttempts = user.otpAttempts + 1;
      await user.save();

      if (user.otpAttempts >= 5) {
        return res
          .status(429)
          .json(
            new ApiResponse(
              429,
              null,
              "Too many failed attempts. Please request a new OTP."
            )
          );
      }

      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid OTP"));
    }

    // OTP is valid, clear OTP fields
    user.otp = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    await user.save();

    // Generate reset token (short-lived)
    const resetToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        purpose: "password_reset",
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "15m", // 15 minutes for password reset
      }
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { resetToken },
          "OTP verified successfully. You can now reset your password."
        )
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Reset password
export const resetUserPassword = asyncHandler(async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Token and new password are required"));
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Password must be at least 6 characters")
        );
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid or expired token"));
    }

    // Check if token is for password reset
    if (decoded.purpose !== "password_reset") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid token purpose"));
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear OTP fields
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    await user.save();

    // Send password reset confirmation email
    const confirmationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Successful</h2>
        <p>Hello ${user.name},</p>
        <p>Your password has been reset successfully.</p>
        <p>If you did not initiate this password reset, please contact our support team immediately.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #777; font-size: 12px;">This is an automated security notification.</p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: "Password Reset Confirmation - Vedic",
        html: confirmationHtml,
      });
    } catch (emailError) {
      console.error("Failed to send reset confirmation email:", emailError);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Password reset successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Logout user
export const logoutUser = asyncHandler(async (req, res) => {
  try {
    // Since JWT is stateless, we just return success
    // Client should remove the token from storage
    return res
      .status(200)
      .json(new ApiResponse(200, null, "Logged out successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Upload to gallery
export const uploadToGallery = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageUrl, imageName } = req.body;

    if (!imageUrl) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Image URL is required"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    // Add image to gallery
    user.gallery.push({
      imageUrl,
      imageName: imageName || `Image ${user.gallery.length + 1}`,
    });

    await user.save();

    return res
      .status(200)
      .json(new ApiResponse(200, user.gallery, "Image uploaded to gallery"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Get gallery
export const getUserGallery = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("gallery");
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user.gallery, "Gallery fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// Delete from gallery
export const deleteFromGallery = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }

    // Find image index
    const imageIndex = user.gallery.findIndex(
      (img) => img._id.toString() === imageId
    );

    if (imageIndex === -1) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Image not found in gallery"));
    }

    // Remove image from gallery
    user.gallery.splice(imageIndex, 1);
    await user.save();

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Image deleted from gallery"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});