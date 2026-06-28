import { WalletService } from '../services/wallet.service.js';

export class WalletController {
  static getWallet(req, res) {
    try {

      console.log("WalletController.getWallet - user:", req.user);

      return res.json({
        walletBalance: req?.user?.walletBalance?? 0,
        depositCash: req?.user?.depositBalance?? 0,
        winningCash: req?.user?.winningsBalance?? 0,
        withdrawableBalance: req?.user?.winningsBalance?? 0
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static deposit(req, res) {
    const { amount, method } = req.body;
    try {
      const tx = WalletService.deposit(req.user, amount, method);
      return res.json({ success: true, user: req.user, transaction: tx });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static withdraw(req, res) {
    const { amount, method } = req.body;
    try {
      const tx = WalletService.withdraw(req.user, amount, method);
      return res.json({ success: true, user: req.user, transaction: tx });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async convert(req, res) {
    const { amount } = req.body;
    try {
      const tx = WalletService.convert(req.user, amount);
      await req.user.save();
      return res.json({ success: true, user: req.user, transaction: tx });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async getTransactions(req, res) {
    try {
      const memTxs = WalletService.getTransactions();
      
      const { TransactionModel } = await import('../models/transaction.model.js');
      const { getFormattedDateTime } = await import('../wallet/transaction.service.js');
      
      const dbTxs = await TransactionModel.find({ user: req.user._id }).sort({ createdAt: -1 });
      const mappedDbTxs = dbTxs.map(tx => ({
        id: tx.transactionId,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        timestamp: getFormattedDateTime(new Date(tx.createdAt)),
        method: tx.method
      }));
      
      return res.json([...mappedDbTxs, ...memTxs]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
