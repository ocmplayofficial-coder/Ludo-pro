const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// JWT secret should be provided via environment in production for security
const JWT_SECRET = process.env.JWT_SECRET || "TRY_PLAYERS_SECURE_KEY";

// Determine runtime mode: production vs development/testing
const isProd = process.env.NODE_ENV === "production";

// APITxt configuration from environment
const APITXT_API_KEY = process.env.APITXT_API_KEY;
const APITXT_SENDER_ID = process.env.APITXT_SENDER_ID || "LUDOTP";

// OTP expiry (in seconds). Default 300 (5 minutes).
const OTP_EXPIRY = Number(process.env.OTP_EXPIRY || 300);

// In-memory OTP store: Map<phoneCleaned, { otp, expiresAt:number }>
const OTP_MAP = new Map();

// Periodic cleanup of expired OTPs (runs every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of OTP_MAP.entries()) {
    if (value.expiresAt <= now) OTP_MAP.delete(key);
  }
}, 60 * 1000);

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

// Helpers
/**
 * Normalize and validate Indian phone numbers.
 * Accepts formats like: 9876543210, +919876543210, 98765 43210, 98765-43210
 * Returns the normalized 10-digit string (e.g. "9876543210") on success,
 * or null when invalid.
 */
const normalizeIndianPhone = (p) => {
  if (!p && p !== 0) return null;
  let s = String(p).trim();

  // Remove spaces and dashes
  s = s.replace(/[\s-]+/g, "");

  // Remove leading + if present
  if (s.startsWith("+")) s = s.slice(1);

  // Remove leading country code 91 if present and more than 10 digits
  if (s.startsWith("91") && s.length > 10) s = s.slice(2);

  // Strip any remaining non-digits
  s = s.replace(/\D/g, "");

  // Must be exactly 10 digits and start with 6-9
  if (!/^[6-9]\d{9}$/.test(s)) return null;
  return s;
};

const formatPhone = (clean) => `+91${clean}`;

// POST /auth/send-otp
const sendOtp = async (req, res) => {
  try {
    const { phone: rawPhone } = req.body;
    console.log('[PHONE INPUT]', rawPhone);
    console.log("[sendOtp] raw input (masked):", typeof rawPhone === 'string' ? rawPhone.replace(/\d(?=\d{2})/g, '*') : rawPhone);

    const cleaned = normalizeIndianPhone(rawPhone);
    console.log('[NORMALIZED PHONE]', cleaned);
    if (!cleaned) {
      console.warn('[NORMALIZED PHONE] invalid phone provided');
      return res.status(400).json({ success: false, message: "Invalid phone number. Provide a valid 10-digit Indian mobile number (starts with 6-9)." });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + OTP_EXPIRY * 1000;

    // Store in-memory
    OTP_MAP.set(cleaned, { otp, expiresAt });
    console.log(`[sendOtp] Stored OTP for ${cleaned}, expires in ${OTP_EXPIRY}s`);

    // Ensure APITxt config
    if (!APITXT_API_KEY) {
      console.error("APITXT_API_KEY not set in environment");
      return res.status(500).json({ success: false, message: "SMS provider not configured" });
    }

    // Send OTP via APITxt OTP API (GET)
    const otpEndpoint = "https://www.apitxt.com/api/sendOTP";

    // Log request without OTP value
    console.log("[APITXT OTP REQUEST]", {
      endpoint: otpEndpoint,
      mobile: `91${cleaned}`
    });

    try {
      const response = await axios.get(
        "https://www.apitxt.com/api/sendOTP",
        {
          params: {
            authkey: process.env.APITXT_API_KEY,
            mobile: `91${cleaned}`,
            otp: otp,
          },
          timeout: 10000,
        }
      );

      console.log("[APITXT OTP REQUEST]", {
        endpoint: "https://www.apitxt.com/api/sendOTP",
        mobile: `91${cleaned}`,
      });

      console.log("[APITXT OTP SUCCESS]", response.data);

      if (response.data?.status === "success") {
        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
        });
      }

      return res.status(500).json({
        success: false,
        message: "OTP provider failed",
        data: response.data,
      });

    } catch (error) {
      console.error(
        "[APITXT OTP ERROR]",
        error.response?.data || error.message
      );

      return res.status(500).json({
        success: false,
        message: "SMS provider failed",
        error: error.response?.data || error.message,
      });
    }
  } catch (err) {
    console.error("[sendOtp] Unexpected error:", err?.message || err);
    return res.status(500).json({ success: false, message: "Failed to generate OTP" });
  }
};

// POST /auth/verify-otp
const verifyOtp = async (req, res) => {
  try {
    // Log the full body for debugging (masked later where appropriate)
    console.log("[verifyOtp] body:", req.body);
    const { phone, code, otp, deviceId } = req.body;
    const rawPhone = phone;
    console.log("[verifyOtp] raw input (masked):", typeof rawPhone === 'string' ? rawPhone.replace(/\d(?=\d{2})/g, '*') : rawPhone);

    const cleaned = normalizeIndianPhone(rawPhone);
    if (!cleaned) {
      return res.status(400).json({ success: false, message: "Invalid phone number. Provide a valid 10-digit Indian mobile number (starts with 6-9)." });
    }

    const verificationCode = code || otp;
    if (!verificationCode) return res.status(400).json({ success: false, message: "Code is required" });

    // No demo acceptance: always validate OTP against the in-memory store

    // PRODUCTION: verify against in-memory store
    const entry = OTP_MAP.get(cleaned);
    if (!entry) {
      console.warn("[verifyOtp] No OTP entry for", cleaned);
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    if (Date.now() > entry.expiresAt) {
      OTP_MAP.delete(cleaned);
      console.warn("[verifyOtp] otp expired", cleaned);
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    if (String(entry.otp) !== String(verificationCode)) {
      console.warn("[verifyOtp] invalid otp", cleaned);
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // OTP verified, remove from store
    OTP_MAP.delete(cleaned);
    console.log("[verifyOtp] otp verified", cleaned);

    // Create or fetch user and return JWT (maintains previous flow)
    let user = await User.findOne({ phone: cleaned });
    if (!user) {
      user = new User({
        phone: cleaned,
        deviceId,
        role: "user",
        name: `Player_${cleaned.slice(-4)}`,
        wallet: { deposit: 0, winnings: 0, bonus: 0 }
      });
      await user.save();
      console.log(`🆕 User created: ${cleaned} -> ${user._id}`);
    } else {
      console.log(`✅ User found: ${cleaned} -> ${user._id}`);
    }

    user.isOnline = true;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, _id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ success: true, token, user: sanitizeUser(user) });
  } catch (err) {
    console.error("[verifyOtp] Unexpected error:", err?.message || err);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
};
