const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const otpStore = {};
const OTP_EXPIRY = 2 * 60 * 1000;

/**
 * 🧹 SANITIZE USER
 * Dashboard aur App ke liye sirf zaroori data bhejne ke liye
 */
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  role: user.role,
  wallet: user.wallet,
  status: user.status,
  referral: {
    code: user.referralCode,
    count: user.referredUsers?.length || 0
  }
});

/**
 * 🔑 ADMIN LOGIN (NEW)
 * Admin Panel ke liye email/password login
 */
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find Admin
    const user = await User.findOne({ email, role: "admin" }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid Admin Credentials" });
    }

    // 2. Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid Admin Credentials" });
    }

    // 3. Generate Token with Role and ID (Consistent structure)
    // 🔥 Yahan 'id' aur '_id' dono bhej rahe hain sync ke liye
    const token = jwt.sign(
      { id: user._id, _id: user._id, role: user.role }, 
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    );

    res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 📲 SEND OTP (For Players)
 */
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) {
      return res.status(400).json({ success: false, message: "Invalid 10-digit phone number" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[phone] = { otp, expires: Date.now() + OTP_EXPIRY };
    console.log(`📩 OTP for ${phone} is: ${otp}`);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 🔐 VERIFY OTP & REGISTER/LOGIN
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp, referralCode } = req.body;
    const record = otpStore[phone];

    if (!record || record.expires < Date.now() || record.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      const newUser = new User({
        phone,
        name: `Player_${phone.slice(-4)}`,
        role: "player",
        wallet: { deposit: 0, winnings: 0, bonus: 0 }
      });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        if (referrer) {
          newUser.referredBy = referrer._id;
          newUser.wallet.deposit += 10;
          referrer.wallet.deposit += 5;
          referrer.referredUsers.push(newUser._id);
          await referrer.save();
        }
      }
      user = await newUser.save();
    }

    delete otpStore[phone];

    const token = jwt.sign(
      { id: user._id, _id: user._id, role: user.role }, 
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    );

    res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 👤 GET PROFILE
 */
exports.getProfile = async (req, res) => {
  try {
    // Middleware ne req.user pehle hi set kar diya hai
    const user = await User.findById(req.user.id || req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 📝 UPDATE PROFILE
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      { name: name.trim() },
      { new: true }
    );
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};