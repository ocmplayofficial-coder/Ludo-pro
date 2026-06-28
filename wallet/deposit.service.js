import { addTransaction } from './transaction.service.js';

export function depositFunds(user, amount, method) {
  const depAmt = parseFloat(amount);
  if (isNaN(depAmt) || depAmt <= 0) {
    throw new Error("Enter a valid deposit amount.");
  }

  user.depositBalance += depAmt;
  user.walletBalance += depAmt;

  const tx = addTransaction({
    type: "DEPOSIT",
    amount: depAmt,
    status: "SUCCESS",
    method: method || "UPI Gateway"
  }, user);

  return tx;
}
