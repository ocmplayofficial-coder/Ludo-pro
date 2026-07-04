import { addTransaction } from '../../wallet/transaction.service.js';
import { UserModel } from '../../models/user.model.js';

export async function awardWinner(user, prize, variant) {
  user.walletBalance = (user.walletBalance || 0) + prize;
  user.winningsBalance = (user.winningsBalance || 0) + prize;
  user.wins = (user.wins || 0) + 1;
  user.earnings = (user.earnings || 0) + prize;

  const tx = addTransaction({
    type: "WINNINGS",
    amount: prize,
    status: "SUCCESS",
    method: `Ludo Arena Win (${variant})`
  }, user);

  // 2% Referral Bonus
  if (user.referredBy) {
    const referrerBonus = Math.max(0.01, prize * 0.02); // 2% bonus, min 0.01
    const referrer = await UserModel.findById(user.referredBy);
    if (referrer) {
      referrer.walletBalance = (referrer.walletBalance || 0) + referrerBonus;
      referrer.referralEarnings = (referrer.referralEarnings || 0) + referrerBonus;
      addTransaction({
        type: "BONUS",
        amount: referrerBonus,
        status: "SUCCESS",
        method: `Referral Win Bonus (From ${user.username})`
      }, referrer);
      await referrer.save();
    }
  }

  try {
    if (typeof user.save === 'function') {
      await user.save();
    }
  } catch (err) {
    console.warn('Failed to persist user after awarding prize', err);
  }

  return tx;
}
