import { addTransaction, getTransactions } from './transaction.service.js';

export function requestWithdrawal(user, amount, method) {
  const withdrawAmt = parseFloat(amount);
  if (isNaN(withdrawAmt) || withdrawAmt <= 0) {
    throw new Error("Enter a valid withdrawal amount.");
  }
  if (withdrawAmt > user.winningsBalance) {
    throw new Error("Insufficient withdrawable winnings balance.");
  }

  user.winningsBalance -= withdrawAmt;
  user.walletBalance -= withdrawAmt;

  const tx = addTransaction({
    type: "WITHDRAW",
    amount: withdrawAmt,
    status: "PENDING",
    method: method || "UPI (paytm@upi)"
  });

  return tx;
}

export function handleAdminWithdrawAction(user, txId, action) {
  const txs = getTransactions();
  const tx = txs.find(t => t.id === txId);
  if (!tx) {
    throw new Error("Transaction not found.");
  }
  if (tx.status !== "PENDING") {
    throw new Error("Transaction is already processed.");
  }

  if (action === "APPROVE") {
    tx.status = "SUCCESS";
  } else if (action === "REJECT") {
    tx.status = "REJECTED";
    user.winningsBalance += tx.amount;
    user.walletBalance += tx.amount;
  }

  return tx;
}
