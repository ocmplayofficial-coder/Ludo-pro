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
      $set: { referralRewardGiven: true, rewardProcessedAt: new Date(), referredBy: referrer._id }
    },
    { new: true }
  );

  if (!updatedUser) {
    // Reward was already given or user not found
    return null;
  }

  // Increment referrer's count and give 30 rs bonus
  const updatedReferrer = await UserModel.findOneAndUpdate(
     { _id: referrer._id },
     { $inc: { referralCount: 1, depositBalance: 30, walletBalance: 30 } },
     { new: true }
  );

  // Sync memory object just in case the caller needs it
  user.referralRewardGiven = updatedUser.referralRewardGiven;
  user.rewardProcessedAt = updatedUser.rewardProcessedAt;
  user.referredBy = updatedUser.referredBy;

  let tx = null;
  if (updatedReferrer) {
    tx = await addTransaction({
      type: "BONUS",
      amount: 30.00,
      status: "SUCCESS",
      method: `Referral Invite Bonus (${user.phoneNumber || 'New User'})`
    }, updatedReferrer);
  }

  return tx;
}
