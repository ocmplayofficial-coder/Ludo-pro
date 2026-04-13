const mongoose = require("mongoose");

/**
 * 👤 USER SCHEMA
 * Optimized for Ludo Pro & Teen Patti with Role-based Access
 */
const userSchema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    trim: true 
  },
  name: { type: String, default: "" },
  avatar: { type: String, default: "avatar1" },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    select: false
  },
  
  // 🔑 ROLE MANAGEMENT (Admin Panel connectivity ke liye)
  role: { 
    type: String, 
    enum: ["user", "admin", "moderator"], 
    default: "user" 
  },

  // 💰 MULTI-WALLET SYSTEM
  wallet: {
    deposit: { type: Number, default: 0, min: 0 }, // Default should be 0, not 10 or 100
    winnings: { type: Number, default: 0, min: 0 },
    bonus: { type: Number, default: 0, min: 0 }
  },

  // 📈 GAME STATISTICS (Ludo + Teen Patti)
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    tp_gamesPlayed: { type: Number, default: 0 }, // Teen Patti specific
    tp_gamesWon: { type: Number, default: 0 }     // Teen Patti specific
  },

  // 🤝 REFERRAL SYSTEM
  referralCode: { type: String, unique: true, index: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  referredUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  referralEarnings: { type: Number, default: 0 },

  // 🛡️ SECURITY & STATUS
  status: { 
    type: String, 
    enum: ["active", "blocked", "suspended"], 
    default: "active" 
  },
  isKycVerified: { type: Boolean, default: false },
  deviceId: String,
  ipAddress: String,

  // 📡 REAL-TIME STATE
  socketId: String,
  isOnline: { type: Boolean, default: false },
  lastLogin: { type: Date, default: Date.now },
  lastSeen: { type: Date }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- 🛠️ VIRTUALS ---

// Total Balance calculation
userSchema.virtual("wallet.balance").get(function() {
  const total = (this.wallet.deposit || 0) + (this.wallet.winnings || 0) + (this.wallet.bonus || 0);
  return parseFloat(total.toFixed(2));
});

// --- ⚙️ MIDDLEWARE ---

// Auto-generate Referral Code
userSchema.pre("save", async function (next) {
  if (this.isNew && !this.referralCode) {
    let isUnique = false;
    while (!isUnique) {
      const code = "TP" + Math.random().toString(36).substring(2, 6).toUpperCase();
      const existing = await mongoose.models.User.findOne({ referralCode: code });
      if (!existing) {
        this.referralCode = code;
        isUnique = true;
      }
    }
  }
  next();
});

// --- 💰 METHODS ---

/**
 * 💸 DEDUCT GAME ENTRY FEE
 * Logic: Bonus -> Deposit -> Winnings
 */
userSchema.methods.deductEntryFee = async function (amount) {
  let remaining = Number(amount);
  const { deposit, winnings, bonus } = this.wallet;
  
  if ((deposit + winnings + bonus) < remaining) {
    throw new Error("Insufficient balance");
  }

  // Deduct from Bonus
  if (this.wallet.bonus >= remaining) {
    this.wallet.bonus -= remaining;
    remaining = 0;
  } else {
    remaining -= this.wallet.bonus;
    this.wallet.bonus = 0;
  }

  // Deduct from Deposit
  if (remaining > 0) {
    if (this.wallet.deposit >= remaining) {
      this.wallet.deposit -= remaining;
      remaining = 0;
    } else {
      remaining -= this.wallet.deposit;
      this.wallet.deposit = 0;
    }
  }

  // Deduct from Winnings
  if (remaining > 0) {
    this.wallet.winnings -= remaining;
  }

  return await this.save();
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);