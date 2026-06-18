import { depositFunds } from '../wallet/deposit.service.js';
import { requestWithdrawal } from '../wallet/withdraw.service.js';
import { convertWinnings } from '../wallet/bonus.service.js';
import { getTransactions } from '../wallet/transaction.service.js';

export class WalletService {
  static deposit(user, amount, method) {
    return depositFunds(user, amount, method);
  }

  static withdraw(user, amount, method) {
    return requestWithdrawal(user, amount, method);
  }

  static convert(user, amount) {
    return convertWinnings(user, amount);
  }

  static getTransactions() {
    return getTransactions();
  }
}
