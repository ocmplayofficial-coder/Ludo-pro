import { addTransaction } from '../../wallet/transaction.service.js';

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

  try {
    if (typeof user.save === 'function') {
      await user.save();
    }
  } catch (err) {
    console.warn('Failed to persist user after awarding prize', err);
  }

  return tx;
}
