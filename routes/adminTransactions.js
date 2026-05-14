const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.put("/transactions/:id/approve", auth, roleMiddleware("admin", "super-admin"), async (req, res) => {
  try {
    console.log("Approve API hit:", req.params.id);
    const transaction = await Transaction.findById(req.params.id);

    console.log("Transaction fetched:", transaction);

    console.log("Transaction.userId:", transaction ? transaction.userId : null);

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      console.log("adminTransactions.approve: transaction not pending", transaction._id, transaction.status);
      return res.status(400).json({ success: false, message: "Already processed" });
    }

    if (transaction.type === "withdraw") {
      const user = await User.findById(transaction.userId);
      console.log("Fetched user for withdraw:", user);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      console.log("User before withdraw update:", JSON.stringify(user.wallet || {}));

      if (!user.wallet || typeof user.wallet !== "object") {
        return res.status(500).json({ success: false, message: "User wallet not available" });
      }

      const currentWinnings = Number(user.wallet.winnings || 0);
      const withdrawalAmount = Number(transaction.amount || 0);
      const newWinnings = currentWinnings - withdrawalAmount;

      if (newWinnings < 0) {
        return res.status(400).json({ success: false, message: "Insufficient balance" });
      }

      user.wallet.winnings = newWinnings;
      await user.save();

      console.log("User after withdraw update:", JSON.stringify(user.wallet || {}));

      transaction.balanceAfter = (transaction.balanceBefore || 0) - withdrawalAmount;
    }

    // Handle deposit type: credit user's deposit wallet and emit socket update
    if (transaction.type === 'deposit') {
      const user = await User.findById(transaction.userId);
      console.log('Fetched user for deposit:', user);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      console.log('User before deposit update:', JSON.stringify(user.wallet || {}));

      const depositAmount = Number(transaction.amount || req.body.amount || 0);
      console.log('Deposit amount to credit:', depositAmount);
      if (!depositAmount || depositAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid deposit amount' });
      }

      // Ensure wallet object exists (some users store wallet as number or object)
      if (typeof user.wallet === 'number') {
        // legacy numeric wallet; convert to object
        user.wallet = { deposit: Number(user.wallet) || 0, winnings: 0, bonus: 0 };
      } else {
        user.wallet = user.wallet || { deposit: 0, winnings: 0, bonus: 0 };
      }

      // Credit deposit
      user.wallet.deposit = (user.wallet.deposit || 0) + depositAmount;

      // Sync top-level balance
      user.balance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);

      await user.save();

      console.log('User after deposit update:', JSON.stringify(user.wallet || {}), 'balance:', user.balance);

      transaction.balanceAfter = (transaction.balanceBefore || 0) + depositAmount;
    }

    transaction.status = "success";
    transaction.processedAt = new Date();
    await transaction.save();

    // Emit wallet update to sockets if applicable
    try {
      const ludoIo = req.app.get('ludoIo');
      const tpIo = req.app.get('tpIo');
      const userId = transaction.userId;
      const updatedUser = await User.findById(userId);
      const updatedBalance = updatedUser ? updatedUser.balance : undefined;
      const payload = { userId, amount: transaction.amount, balance: updatedBalance, type: transaction.type || 'deposit' };
      if (ludoIo) ludoIo.to(String(userId)).emit('walletUpdated', payload);
      if (tpIo) tpIo.to(String(userId)).emit('walletUpdated', payload);
      console.log('adminTransactions.approve: emitted walletUpdated', payload);
    } catch (emitErr) {
      console.warn('adminTransactions.approve: failed to emit walletUpdated', emitErr);
    }

    // Return updated wallet in response for convenience
    try {
      const respUser = await User.findById(transaction.userId);
      return res.json({ success: true, message: "Transaction approved successfully", transaction, wallet: respUser ? respUser.wallet : null, balance: respUser ? respUser.balance : null });
    } catch (respErr) {
      console.warn('adminTransactions.approve: failed to fetch user for response', respErr);
      return res.json({ success: true, message: "Transaction approved successfully", transaction });
    }
  } catch (err) {
    console.error("Approve transaction error:", err);
    res.status(500).json({ success: false, message: "Failed to approve transaction" });
  }
});

router.put("/transactions/:id/reject", auth, roleMiddleware("admin", "super-admin"), async (req, res) => {
  try {
    console.log("Reject API hit:", req.params.id);
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const user = await User.findById(transaction.userId);
    if (user) {
      user.wallet.winnings = (user.wallet.winnings || 0) + (transaction.amount || 0);
      await user.save();
    }

    transaction.status = "failed";
    await transaction.save();

    res.json({ success: true, message: "Transaction rejected successfully", transaction });
  } catch (err) {
    console.error("Reject transaction error:", err);
    res.status(500).json({ success: false, message: "Failed to reject transaction" });
  }
});

module.exports = router;
