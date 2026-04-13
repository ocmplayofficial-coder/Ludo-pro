const mongoose = require("mongoose");

/**
 * 💰 TRANSACTION SCHEMA
 * Professional ledger for Ludo Pro & Teen Patti
 */
const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    unique: true,
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  type: {
    type: String,
    enum: [
      "deposit",      // Add Cash
      "withdraw",     // Cash Out
      "winning",      // Game Win
      "bonus",        // Referral/SignUp
      "refund",       // Game Cancelled
      "entry_fee",    // Match Joining Fee
      "conversion",   // Winnings to Deposit
      "commission"    // Platform Fee (Admin Revenue)
    ],
    required: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // 👛 WALLET TRACKING
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },

  walletSource: {
    type: String,
    enum: ["deposit", "winning", "bonus", "all"],
    default: "deposit"
  },

  status: {
    type: String,
    enum: ["pending", "success", "failed", "reversed"],
    default: "pending",
    index: true
  },

  description: String,

  // 💳 PAYMENT GATEWAY & DYNAMIC QR DETAILS
  paymentMethod: {
    type: String,
    enum: ["upi", "card", "netbanking", "wallet", "internal", "manual", "qr_scan"],
    default: "internal"
  },
  
  // 🔥 IMPORTANT: Track kaunsa Dynamic UPI/QR use hua tha
  dynamicPaymentUsed: {
    methodId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod" },
    upiId: String,
    qrName: String
  },

  paymentId: String, // Bank UTR or Transaction Ref
  orderId: String,
  bankDetails: mongoose.Schema.Types.Mixed,
  
  // Image path for screenshot upload by user
  proofScreenshot: String, 

  // 🎮 GAME LINKS
  ludoGameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Game",
    index: true
  },
  tpGameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TPGame", 
    index: true
  },

  // 🛡️ FRAUD & SECURITY
  ipAddress: String,
  deviceId: String,
  failureReason: String,

  metadata: {
    referralCode: String,
    adminNote: String,
    gameType: { type: String, enum: ["LUDO", "TEEN_PATTI", "SYSTEM"] }
  }

}, {
  timestamps: true
});

// --- 🛠️ MIDDLEWARE ---

// 1. 🔥 AUTO GENERATE TRANSACTION ID
transactionSchema.pre("save", function (next) {
  if (this.isNew && !this.transactionId) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.transactionId = `TXN${timestamp}${random}`; 
  }
  next();
});

// 2. 🛡️ INTEGRITY CHECK
transactionSchema.pre("validate", function (next) {
  // Deposit ya winning ke waqt balance negative nahi ho sakta
  if (this.balanceAfter < 0) {
    return next(new Error("⚠️ Integrity Error: Negative wallet balance detected."));
  }
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);