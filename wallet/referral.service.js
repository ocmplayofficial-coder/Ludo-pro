import { UserModel } from '../models/user.model.js';
import { addTransaction } from './transaction.service.js';

export async function claimReferralBonus(user, code) {
  if (!code || code.trim() === "") {
    return null;
  }

  const referrer = await UserModel.findOne({ referralCode: code.toUpperCase() });
  if (!referrer) {
    return null;
  }
  
  if (user.referredBy || user._id.toString() === referrer._id.toString()) {
    return null;
  }

  // Atomic update to ensure reward is given ONLY ONCE
  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: user._id, referralRewardGiven: { $ne: true } },
    { 
      $inc: { depositBalance: 10, walletBalance: 10 },
      $set: { referralRewardGiven: true, rewardProcessedAt: new Date(), referredBy: referrer._id }
    },
    { new: true }
  );

  if (!updatedUser) {
    // Reward was already given or user not found
    return null;
  }

  // Increment referrer's count
  await UserModel.updateOne(
     { _id: referrer._id },
     { $inc: { referralCount: 1 } }
  );

  // Sync memory object just in case the caller needs it
  user.depositBalance = updatedUser.depositBalance;
  user.walletBalance = updatedUser.walletBalance;
  user.referralRewardGiven = updatedUser.referralRewardGiven;
  user.rewardProcessedAt = updatedUser.rewardProcessedAt;
  user.referredBy = updatedUser.referredBy;

  const tx = addTransaction({
    type: "BONUS",
    amount: 10.00,
    status: "SUCCESS",
    method: `Referral Invite Bonus`
  }, user);

  return tx;
}
