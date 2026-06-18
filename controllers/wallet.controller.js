import { WalletService } from '../services/wallet.service.js';

export class WalletController {
  static getWallet(req, res) {
    try {
      return res.json({
        walletBalance: req.user.walletBalance,
        depositCash: req.user.depositBalance,
        winningCash: req.user.winningsBalance,
        withdrawableBalance: req.user.winningsBalance
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

  static convert(req, res) {
    const { amount } = req.body;
    try {
      const tx = WalletService.convert(req.user, amount);
      return res.json({ success: true, user: req.user, transaction: tx });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static getTransactions(req, res) {
    try {
      const txs = WalletService.getTransactions();
      return res.json(txs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
