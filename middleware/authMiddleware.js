const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * 🔐 AUTH MIDDLEWARE
 * Ensures the user is logged in and the account is active.
 */
module.exports = async (req, res, next) => {
  try {
    let token;

    // 1. 🔥 Extract Token from Header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "❌ Access Denied. No token provided.",
      });
    }

    // 2. 🔥 Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. 🛡️ Database Sync (The Critical Fix)
    // Hum decoded.id aur decoded._id dono check karenge
    const userId = decoded.id || decoded._id;

    if (!userId) {
       console.error("🛡️ AUTH_ERROR: Token does not contain user ID");
       return res.status(401).json({ success: false, message: "Invalid Token Structure" });
    }

    const user = await User.findById(userId).select("_id phone role status name email");

    if (!user) {
      console.log(`👤 AUTH_DEBUG: User with ID ${userId} not found in MongoDB Atlas.`);
      return res.status(401).json({
        success: false,
        message: "👤 User no longer exists.",
      });
    }

    // Check for blocked users
    if (user.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "🚫 Your account has been suspended.",
      });
    }

    // 4. Attach Verified User to Request
    req.user = user;

    next();
  } catch (error) {
    console.error("🛡️ AUTH_MIDDLEWARE_ERROR:", error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "⏰ Session expired. Please login again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "❌ Authentication failed. Invalid token.",
    });
  }
};