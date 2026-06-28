import { UserModel } from '../models/user.model.js';
import { addTransaction } from './transaction.service.js';

export async function claimReferralBonus(user, code) {
  if (!code || code.trim() === "") {
    return null;
  }

  // Atomic update to ensure reward is given ONLY ONCE
  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: user._id, referralRewardGiven: { $ne: true } },
    { 
      $inc: { depositBalance: 50, walletBalance: 50 },
      $set: { referralRewardGiven: true, rewardProcessedAt: new Date() }
    },
    { new: true }
  );

  if (!updatedUser) {
    // Reward was already given or user not found
    return null;
  }

  // Sync memory object just in case the caller needs it
  user.depositBalance = updatedUser.depositBalance;
  user.walletBalance = updatedUser.walletBalance;
  user.referralRewardGiven = updatedUser.referralRewardGiven;
  user.rewardProcessedAt = updatedUser.rewardProcessedAt;

  const tx = addTransaction({
    type: "BONUS",
    amount: 50.00,
    status: "SUCCESS",
    method: `Referral Invite Bonus (${code})`
  }, user);

  return tx;
}
