import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";
import sendEmail from "../../utils/sendEmail.js";
import { Admin } from "../../models/user/admin.model.js";

export const registerAdmin = asyncHandler(async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
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

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Admin already exists"));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin
    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
    });

    // Remove password from response
    const adminResponse = {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };

    return res
      .status(201)
      .json(
        new ApiResponse(201, adminResponse, "Admin registered successfully"),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const loginAdmin = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email and password are required"));
    }

    // Find admin
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid email or password"));
    }

    // Check if account is active
    if (!admin.isActive) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Account is deactivated"));
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid email or password"));
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        role: "admin",
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "24h",
      },
    );

    // Prepare response data
    const adminData = {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      lastLogin: admin.lastLogin,
      token,
    };

    return res
      .status(200)
      .json(new ApiResponse(200, adminData, "Login successful"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const getAdminProfile = asyncHandler(async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select(
      "-password -otp -otpExpires",
    );

    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, admin, "Profile fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const updateAdminProfile = asyncHandler(async (req, res) => {
  try {
    const { name } = req.body;
    const adminId = req.user.id;

    if (!name) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Name is required"));
    }

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { name },
      { new: true, runValidators: true },
    ).select("-password -otp -otpExpires");

    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, admin, "Profile updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const changePassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Both passwords are required"));
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "New password must be at least 6 characters",
          ),
        );
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.password,
    );
    if (!isCurrentPasswordValid) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Current password is incorrect"));
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    admin.password = hashedNewPassword;
    await admin.save();

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Password changed successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const forgotPassword = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email is required"));
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      // Return success even if admin not found (security best practice)
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            null,
            "If an account exists with this email, you will receive a password reset OTP",
          ),
        );
    }

    // Check OTP attempts limit
    if (admin.otpAttempts >= 5) {
      return res
        .status(429)
        .json(
          new ApiResponse(
            429,
            null,
            "Too many OTP attempts. Please try again later.",
          ),
        );
    }

    // Check time since last OTP
    const now = new Date();
    if (admin.lastOtpSent) {
      const timeDiff = now - admin.lastOtpSent;
      const minutesDiff = timeDiff / (1000 * 60);
      if (minutesDiff < 2) {
        // 2-minute cooldown
        return res
          .status(429)
          .json(
            new ApiResponse(
              429,
              null,
              "Please wait before requesting another OTP",
            ),
          );
      }
    }

    // Generate OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    // Update admin with OTP
    admin.otp = otp;
    admin.otpExpires = otpExpires;
    admin.otpAttempts = admin.otpAttempts + 1;
    admin.lastOtpSent = now;
    await admin.save();

    // Send OTP via email
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${admin.name},</p>
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
      to: admin.email,
      subject: "Password Reset OTP - Vedic Admin",
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
        new ApiResponse(500, null, "Failed to process forgot password request"),
      );
  }
});

export const verifyOtp = asyncHandler(async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email and OTP are required"));
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Check if OTP exists and is not expired
    if (!admin.otp || !admin.otpExpires) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "No OTP found or OTP expired"));
    }

    const now = new Date();
    if (now > admin.otpExpires) {
      // Clear expired OTP
      admin.otp = null;
      admin.otpExpires = null;
      await admin.save();

      return res
        .status(400)
        .json(new ApiResponse(400, null, "OTP has expired"));
    }

    // Verify OTP
    if (admin.otp !== otp) {
      // Increment OTP attempts
      admin.otpAttempts = admin.otpAttempts + 1;
      await admin.save();

      if (admin.otpAttempts >= 5) {
        return res
          .status(429)
          .json(
            new ApiResponse(
              429,
              null,
              "Too many failed attempts. Please request a new OTP.",
            ),
          );
      }

      return res.status(400).json(new ApiResponse(400, null, "Invalid OTP"));
    }

    // OTP is valid, clear OTP fields
    admin.otp = null;
    admin.otpExpires = null;
    admin.otpAttempts = 0;
    await admin.save();

    // Generate reset token (short-lived)
    const resetToken = jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        purpose: "password_reset",
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "15m", // 15 minutes for password reset
      },
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { resetToken },
          "OTP verified successfully. You can now reset your password.",
        ),
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const resetPassword = asyncHandler(async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Token and new password are required"),
        );
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Password must be at least 6 characters"),
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

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear OTP fields
    admin.password = hashedPassword;
    admin.otp = null;
    admin.otpExpires = null;
    admin.otpAttempts = 0;
    await admin.save();

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Password reset successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const logoutAdmin = asyncHandler(async (req, res) => {
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

export const getAllAdmins = asyncHandler(async (req, res) => {
  try {
    const admins = await Admin.find()
      .select("-password -otp -otpExpires")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json(new ApiResponse(200, admins, "Admins fetched successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const updateAdminStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "isActive must be a boolean"));
    }

    // Prevent self-deactivation
    if (id === req.user.id && !isActive) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Cannot deactivate your own account"));
    }

    const admin = await Admin.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, runValidators: true },
    ).select("-password -otp -otpExpires");

    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    const statusMessage = isActive
      ? "Admin activated successfully"
      : "Admin deactivated successfully";

    return res.status(200).json(new ApiResponse(200, admin, statusMessage));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
