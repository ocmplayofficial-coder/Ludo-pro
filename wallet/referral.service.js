import { addTransaction } from './transaction.service.js';

export function claimReferralBonus(user, code) {
  if (!code || code.trim() === "") {
    return null;
  }
  
  user.depositBalance += 50; // Bonus of ₹50 for referral entry
  user.walletBalance += 50;

  const tx = addTransaction({
    type: "BONUS",
    amount: 50.00,
    status: "SUCCESS",
    method: `Referral Invite Bonus (${code})`
  });

  return tx;
}
