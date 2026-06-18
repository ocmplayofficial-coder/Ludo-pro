import { addTransaction } from './transaction.service.js';

export function convertWinnings(user, amount) {
  const convAmt = parseFloat(amount);
  if (isNaN(convAmt) || convAmt <= 0) {
    throw new Error("Enter a valid conversion amount.");
  }
  if (convAmt > user.winningsBalance) {
    throw new Error("Insufficient winnings balance to convert.");
  }

  const bonusAmount = convAmt * 0.03; // 3% bonus extra
  const totalAdded = convAmt + bonusAmount;

  user.winningsBalance -= convAmt;
  user.depositBalance += totalAdded;
  user.walletBalance += bonusAmount; // Net increase in wallet balance by the 3% bonus

  const tx = addTransaction({
    id: "CONV" + Math.floor(1000 + Math.random() * 9000),
    type: "BONUS",
    amount: bonusAmount,
    status: "SUCCESS",
    method: "3% Winnings Convert Bonus"
  });

  return tx;
}
