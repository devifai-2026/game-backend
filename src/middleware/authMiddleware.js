import jwt from "jsonwebtoken";
import ApiResponse from "../utils/ApiResponse.js";
import { Admin } from "../models/user/admin.model.js";
import { User } from "../models/user/user.model.js";

// Middleware to verify admin token
export const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Access denied. No token provided."));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Check if token is for admin
    if (decoded.role !== "admin") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied. Admin privileges required."));
    }

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Admin not found or token invalid."));
    }

    // Check if admin account is active
    if (!admin.isActive) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Account is deactivated. Contact administrator."));
    }

    req.user = decoded;
    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Token expired. Please login again."));
    } else if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid token."));
    }

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Authentication failed."));
  }
};

// Middleware to verify user token
export const verifyUser = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Access denied. No token provided."));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Check if token is for user
    if (decoded.role !== "user") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied. User privileges required."));
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "User not found or token invalid."));
    }

    // Check if user account is active
    if (!user.isActive) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Account is deactivated. Contact support."));
    }

    req.user = decoded;
    req.userData = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Token expired. Please login again."));
    } else if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid token."));
    }

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Authentication failed."));
  }
};

// Middleware to verify either admin or user token
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Access denied. No token provided."));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decoded.role === "admin") {
      const admin = await Admin.findById(decoded.id).select("-password");
      if (!admin || !admin.isActive) {
        return res
          .status(401)
          .json(new ApiResponse(401, null, "Invalid or inactive admin account."));
      }
      req.user = decoded;
      req.admin = admin;
    } else if (decoded.role === "user") {
      const user = await User.findById(decoded.id).select("-password");
      if (!user || !user.isActive) {
        return res
          .status(401)
          .json(new ApiResponse(401, null, "Invalid or inactive user account."));
      }
      req.user = decoded;
      req.userData = user;
    } else {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Invalid role in token."));
    }

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Token expired. Please login again."));
    } else if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid token."));
    }

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Authentication failed."));
  }
};