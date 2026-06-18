import mongoose from "mongoose";
import { UserModel } from "../models/user.model.js";
import { verifyToken } from "../config/jwt.js";

export async function authMiddleware(req, res, next) {
  try {
    // Accept token from Authorization header,
    // x-access-token header, or query param
    const authHeader = req.headers.authorization;
    const altToken = req.headers["x-access-token"] || req.query?.token;

    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (typeof altToken === "string" && altToken.length > 0) {
      token = altToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized access. No active token session found."
      });
    }

    console.log("MATCHMAKING TOKEN", token);

    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized access. Invalid or expired token session."
      });
    }

    console.log("JWT TOKEN USER", decoded);

    // ==========================
    // ADMIN TOKEN SUPPORT
    // ==========================
    if (
      decoded.role === "admin" &&
      decoded.id === "admin"
    ) {
      req.user = {
        id: "admin",
        role: "admin",
        email: decoded.email
      };

      return next();
    }

    // ==========================
    // VALIDATE OBJECT ID
    // ==========================
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({
        success: false,
        error: "Invalid user session."
      });
    }

    // ==========================
    // FIND USER
    // ==========================
    const activeUser = await UserModel.findById(decoded.id);

    if (!activeUser) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized access. User profile session not found."
      });
    }

    req.user = activeUser;

    next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error);

    return res.status(401).json({
      success: false,
      error: "Authentication failed."
    });
  }
}