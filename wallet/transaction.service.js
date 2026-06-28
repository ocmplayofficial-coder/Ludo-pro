import { db } from '../config/db.js';

export function getFormattedDateTime() {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const formattedHours = hours % 12 || 12;
  return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} ${formattedHours}:${mins} ${ampm}`;
}

export function getTransactions() {
  return db.transactions;
}

export function addTransaction(tx, user = null) {
  const newTx = {
    id: tx.id || "TXN" + Math.floor(1000 + Math.random() * 9000),
    type: tx.type,
    amount: parseFloat(tx.amount),
    status: tx.status || "SUCCESS",
    timestamp: tx.timestamp || getFormattedDateTime(),
    method: tx.method
  };
  db.transactions.unshift(newTx);

  if (user && user._id) {
    import('../models/transaction.model.js').then(({ TransactionModel }) => {
      TransactionModel.create({
        transactionId: newTx.id,
        user: user._id,
        type: newTx.type,
        amount: newTx.amount,
        status: newTx.status,
        method: newTx.method
      }).catch(err => console.warn('Failed to save tx to db:', err));
    }).catch(err => console.warn('Failed to load tx model:', err));
  }

  return newTx;
}
