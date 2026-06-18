import { handleAdminWithdrawAction } from '../wallet/withdraw.service.js';

export class AdminService {
  static handleTransactionAction(user, txnId, action) {
    return handleAdminWithdrawAction(user, txnId, action);
  }
}
