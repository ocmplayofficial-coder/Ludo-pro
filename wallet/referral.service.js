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
      $set: { referralRewardGiven: true, rewardProcessedAt: new Date(), referredBy: referrer._id },
      $inc: { depositBalance: 50, walletBalance: 50 } // Give new user 50rs deposit balance
    },
    { new: true }
  );

  if (!updatedUser) {
    // Reward was already given or user not found
    return null;
  }

  // Increment referrer's count (financial commission handled during gameplay)
  const updatedReferrer = await UserModel.findOneAndUpdate(
     { _id: referrer._id },
     { $inc: { referralCount: 1 } },
     { new: true }
  );

  // Sync memory object just in case the caller needs it
  user.referralRewardGiven = updatedUser.referralRewardGiven;
  user.rewardProcessedAt = updatedUser.rewardProcessedAt;
  user.referredBy = updatedUser.referredBy;

  let tx = null;
  if (updatedUser) {
    tx = await addTransaction({
      type: "BONUS",
      amount: 50.00,
      status: "SUCCESS",
      method: `Welcome Bonus (Referred by ${referrer.username})`
    }, updatedUser);
  }

  return tx;
}
