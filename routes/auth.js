const router = require("express").Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const bcrypt = require("bcryptjs");

/**
 * 🔐 CONFIG
 */
const otpStore = {};
const JWT_SECRET = process.env.JWT_SECRET || "TRY_PLAYERS_SECURE_KEY";
const OTP_EXPIRY = 2 * 60 * 1000;

// Env variables for Admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

/**
 * 🧹 USER SANITIZER
 */
const sanitizeUser = (user) => {
  const wallet = user.wallet || { deposit: 0, winnings: 0, bonus: 0 };
  const deposit = Number(wallet.deposit || 0);
  const winnings = Number(wallet.winnings || 0);
  const bonus = Number(wallet.bonus || 0);
  const balance = deposit + winnings + bonus;

  return {
    _id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    wallet: {
      deposit,
      winnings,
      bonus,
      balance: parseFloat(balance.toFixed(2))
    },
    isOnline: user.isOnline,
    status: user.status
  };
};

/**
 * 🔥 1. GLOBAL LOGIN (Admin + User)
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // --- 🛡️ ADMIN LOGIN LOGIC ---
    if (role === "admin" || (email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase())) {
      const adminUser = await User.findOne({ email: email.toLowerCase(), role: "admin" }).select("+password");
      
      if (!adminUser) {
        return res.status(401).json({ success: false, message: "Admin account not found in Database" });
      }

      const isMatch = await bcrypt.compare(password, adminUser.password).catch(() => password === ADMIN_PASSWORD);

      if (isMatch || password === ADMIN_PASSWORD) {
        // ✅ FIXED TOKEN: Dashboard sync ke liye id aur _id dono zaroori hain
        const token = jwt.sign(
          { id: adminUser._id, _id: adminUser._id, role: "admin" },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        return res.json({
          success: true,
          token,
          user: sanitizeUser(adminUser)
        });
      }
      return res.status(401).json({ success: false, message: "Invalid Admin Credentials" });
    }
    
    res.status(400).json({ success: false, message: "Please use OTP for mobile login" });
  } catch (err) {
    console.error("LOGIN_ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error during login" });
  }
});

/**
 * 🔥 2. SEND OTP
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Invalid 10-digit number" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    otpStore[phone] = { otp, expires: Date.now() + OTP_EXPIRY };
    console.log(`📩 [OTP_SENT] ${phone} -> ${otp}`);
    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

/**
 * 🔥 3. VERIFY OTP & REGISTER
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp, deviceId } = req.body;
    const record = otpStore[phone];

    if (!record || record.expires < Date.now() || record.otp != otp) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({
        phone,
        deviceId,
        role: "user",
        name: `Player_${phone.slice(-4)}`,
        wallet: { deposit: 0, winnings: 0, bonus: 0 }
      });
      await user.save();
    }

    user.isOnline = true;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, _id: user._id, role: "user" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    delete otpStore[phone];
    res.json({ success: true, token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Verification failed" });
  }
});

/**
 * 🛡️ INTERNAL AUTH MIDDLEWARE
 */
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No Token Provided" });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Authentication Failed" });
  }
};

/**
 * 👤 4. GET MY PROFILE
 */
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json({ success: true, user: sanitizeUser(user), transactions });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/**
 * 🚪 5. LOGOUT
 */
router.post("/logout", auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    await User.findByIdAndUpdate(userId, { isOnline: false });
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
module.exports.auth = auth;