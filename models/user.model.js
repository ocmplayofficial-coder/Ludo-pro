import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    status: {
      type: String,
      default: "active"
    },
    nickname: { type: String, required: true },
    avatar: { type: String, required: true },
    preferredColor: { type: String, enum: ['red', 'blue', 'green', 'yellow'], default: 'red' },
    referralCode: { type: String, default: () => Math.random().toString(36).substring(2, 8).toUpperCase() },
    // wallet related fields (can be moved to a separate Wallet model later)
    walletBalance: { type: Number, default: 0 },
    depositBalance: { type: Number, default: 0 },
    winningsBalance: { type: Number, default: 0 },
    // gameplay statistics
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referralRewardGiven: { type: Boolean, default: false },
    rewardProcessedAt: { type: Date },
    notifications: {
      type: [
        {
          id: { type: String, required: true },
          message: { type: String, required: true },
          read: { type: Boolean, default: false },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

/**
 * Helper to generate a default user object from only a phone number.
 * Used when a new OTP request creates a brand‑new user.
 */
userSchema.statics.fromPhone = function (phoneNumber) {
  const username = `Player_${phoneNumber.slice(-4)}`;
  return new this({
    phoneNumber,
    username,
    nickname: username,
    avatar: username[0]
  });
};

export const UserModel = mongoose.model("User", userSchema);
