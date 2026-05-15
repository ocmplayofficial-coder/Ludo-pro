const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { auth } = require("./auth");

// Minimum deposit allowed (can be overridden via env)
const MIN_DEPOSIT = Number(process.env.MIN_DEPOSIT) || 2;

/**
 * 💰 1. CREATE DEPOSIT REQUEST (MANUAL PAYMENT PROOF)
 * Player submits payment proof for admin verification
 */
router.post("/deposit-request", auth, async (req, res) => {
  const { amount, transactionId, paymentMethod } = req.body;
  console.log("[deposit-request] payload:", { amount, transactionId, paymentMethod });

  try {
    // Validation
    const numAmount = Number(amount);
    if (!numAmount || Number.isNaN(numAmount) || numAmount < MIN_DEPOSIT) {
      return res.status(400).json({ success: false, message: `Minimum deposit ₹${MIN_DEPOSIT}` });
    }

    if (!transactionId || transactionId.trim().length < 12) {
      return res.status(400).json({ success: false, message: "Valid 12-digit Transaction ID required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get current balance for tracking
    const currentBalance = Number(user.wallet.balance);

    // Create transaction record with pending status
    // Normalize paymentMethod to match schema enum (lowercase values)
    const rawPm = (paymentMethod || 'manual');
    const pm = typeof rawPm === 'string' ? rawPm.toLowerCase().replace(/\s+/g, '_') : 'manual';
    const allowedMethods = ["upi", "card", "netbanking", "wallet", "internal", "manual", "qr_scan"];
    const finalPm = allowedMethods.includes(pm) ? pm : 'manual';
    console.log('[deposit-request] normalized paymentMethod:', finalPm);

    const newTx = new Transaction({
      userId: req.user.id,
      type: 'deposit',
      amount: Number(numAmount),
      paymentId: transactionId.trim(), // Store UTR/TXN ID here
      paymentMethod: finalPm,
      status: 'pending', // Admin will approve later
      balanceBefore: currentBalance,
      balanceAfter: currentBalance, // Will update on approval
      description: `Deposit request: ₹${numAmount} via ${finalPm} (UTR: ${transactionId.trim()})`,
      metadata: {
        gameType: 'SYSTEM',
        adminNote: 'Awaiting manual verification'
      }
    });

    await newTx.save();

    res.json({
      success: true,
      message: "Deposit request submitted! Admin will verify within 24 hours.",
      transactionId: newTx.transactionId
    });

  } catch (err) {
    console.error("Deposit request error:", err);
    res.status(500).json({ success: false, message: "Failed to create deposit request" });
  }
});

/**
 * 📊 2. GET ALL TRANSACTIONS (ADMIN ONLY)
 * For admin panel transaction logs
 */
router.get("/all", auth, async (req, res) => {
  try {
    // Check if user is admin (you might want to add role check)
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'super-admin') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const transactions = await Transaction.find({})
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const normalized = transactions.map((transaction) => ({
      ...transaction,
      bankDetails: transaction.bankDetails
        ? { ...transaction.bankDetails, accountNumber: transaction.bankDetails.accountNumber }
        : transaction.bankDetails
    }));

    res.json({
      success: true,
      transactions: normalized
    });

  } catch (err) {
    console.error("Get transactions error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch transactions" });
  }
});

/**
 * ✅ 3. APPROVE DEPOSIT (ADMIN ONLY)
 * Admin approves pending deposit and credits wallet
 */
router.post("/approve/:transactionId", auth, async (req, res) => {
  try {
    // Check admin role
    const admin = await User.findById(req.user.id);
    if (admin.role !== 'admin' && admin.role !== 'super-admin') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { transactionId } = req.params;
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    // Prepare admin note
    transaction.metadata.adminNote = `Approved by ${admin.name} on ${new Date().toISOString()}`;

    let user = await User.findById(transaction.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Handle deposit / withdraw / others
    if (transaction.type === 'deposit') {
      const currentBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
      // Credit deposit wallet
      user.wallet.deposit = (user.wallet.deposit || 0) + transaction.amount;
      await user.save();

      // Sync top-level balance
      try {
        const newBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
        user.balance = newBalance;
        await user.save();
      } catch (syncErr) {
        console.warn("Failed to sync user.balance:", syncErr);
      }

      transaction.balanceBefore = transaction.balanceBefore || currentBalance;
      transaction.balanceAfter = currentBalance + transaction.amount;

      console.log("Approve: credited user", user._id.toString(), "amount", transaction.amount, "newDeposit", user.wallet.deposit);
    } else if (transaction.type === 'withdraw') {
      // Withdraw was already deducted at request time; do not modify wallet again
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore - transaction.amount);
    } else {
      transaction.balanceAfter = transaction.balanceAfter || transaction.balanceBefore;
    }

    transaction.status = 'success';
    await transaction.save();

    // Emit socket event to notify user about wallet update
    try {
      const ludoIo = req.app.get("ludoIo");
      const tpIo = req.app.get("tpIo");
      const updatedBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
      const payload = {
        userId: user._id,
        amount: transaction.amount,
        balance: updatedBalance,
        type: transaction.type || 'deposit'
      };
      if (ludoIo) ludoIo.to(user._id.toString()).emit("walletUpdated", payload);
      if (tpIo) tpIo.to(user._id.toString()).emit("walletUpdated", payload);
      console.log("Emitted walletUpdated to user:", payload);
    } catch (emitErr) {
      console.warn("Failed to emit wallet update:", emitErr);
    }

    // Return updated balance for convenience
    res.json({
      success: true,
      message: transaction.type === 'withdraw'
        ? `Withdrawal approved for ₹${transaction.amount}`
        : `Deposit approved! ₹${transaction.amount} credited to ${user ? user.name : 'user'}`,
      transaction: transaction,
      balance: (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0)
    });

  } catch (err) {
    console.error("Approve deposit error:", err);
    res.status(500).json({ success: false, message: "Failed to approve deposit" });
  }
});

router.put("/approve/:transactionId", auth, async (req, res) => {
  try {
    // Check admin role
    const admin = await User.findById(req.user.id);
    if (admin.role !== 'admin' && admin.role !== 'super-admin') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { transactionId } = req.params;
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    // Prepare admin note
    transaction.metadata.adminNote = `Approved by ${admin.name} on ${new Date().toISOString()}`;

    let user = await User.findById(transaction.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (transaction.type === 'deposit') {
      const currentBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
      user.wallet.deposit = (user.wallet.deposit || 0) + transaction.amount;
      await user.save();

      // Sync top-level balance
      try {
        const newBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
        user.balance = newBalance;
        await user.save();
      } catch (syncErr) {
        console.warn("Failed to sync user.balance:", syncErr);
      }

      transaction.balanceBefore = transaction.balanceBefore || currentBalance;
      transaction.balanceAfter = currentBalance + transaction.amount;

      console.log("Approve (PUT): credited user", user._id.toString(), "amount", transaction.amount, "newDeposit", user.wallet.deposit);
    } else if (transaction.type === 'withdraw') {
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore - transaction.amount);
    } else {
      transaction.balanceAfter = transaction.balanceAfter || transaction.balanceBefore;
    }

    transaction.status = 'success';
    await transaction.save();

    // Emit wallet update
    try {
      const ludoIo = req.app.get("ludoIo");
      const tpIo = req.app.get("tpIo");
      const updatedBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
      const payload = { userId: user._id, amount: transaction.amount, balance: updatedBalance, type: transaction.type || 'deposit' };
      if (ludoIo) ludoIo.to(user._id.toString()).emit("walletUpdated", payload);
      if (tpIo) tpIo.to(user._id.toString()).emit("walletUpdated", payload);
      console.log("Emitted walletUpdated to user:", payload);
    } catch (emitErr) {
      console.warn("Failed to emit wallet update:", emitErr);
    }

    res.json({ success: true, message: transaction.type === 'withdraw' ? `Withdrawal approved for ₹${transaction.amount}` : `Deposit approved! ₹${transaction.amount} credited to ${user ? user.name : 'user'}`, transaction: transaction, balance: (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0) });

  } catch (err) {
    console.error("Approve deposit error:", err);
    res.status(500).json({ success: false, message: "Failed to approve deposit" });
  }
});

/**
 * ❌ 4. REJECT DEPOSIT (ADMIN ONLY)
 * Admin rejects deposit request
 */
router.post("/reject/:transactionId", auth, async (req, res) => {
  try {
    // Check admin role
    const admin = await User.findById(req.user.id);
    if (admin.role !== 'admin' && admin.role !== 'super-admin') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { transactionId } = req.params;
    const { reason } = req.body;

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    // Refund withdraws back to winnings if rejected
    const user = await User.findById(transaction.userId);
    if (transaction.type === 'withdraw' && user) {
      user.wallet.winnings = (user.wallet.winnings || 0) + transaction.amount;
      await user.save();
      transaction.balanceAfter = transaction.balanceBefore;
    }

    // Update transaction status
    transaction.status = 'failed';
    transaction.failureReason = reason || 'Rejected by admin';
    transaction.metadata.adminNote = `Rejected by ${admin.name}: ${reason}`;

    await transaction.save();

    res.json({
      success: true,
      message: transaction.type === 'withdraw' ? "Withdrawal request rejected" : "Deposit request rejected",
      transaction: transaction
    });

  } catch (err) {
    console.error("Reject deposit error:", err);
    res.status(500).json({ success: false, message: "Failed to reject deposit" });
  }
});

router.put("/reject/:transactionId", auth, async (req, res) => {
  try {
    // Check admin role
    const admin = await User.findById(req.user.id);
    if (admin.role !== 'admin' && admin.role !== 'super-admin') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { transactionId } = req.params;
    const { reason } = req.body;

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    // Refund withdraws back to winnings if rejected
    const user = await User.findById(transaction.userId);
    if (transaction.type === 'withdraw' && user) {
      user.wallet.winnings = (user.wallet.winnings || 0) + transaction.amount;
      await user.save();
      transaction.balanceAfter = transaction.balanceBefore;
    }

    // Update transaction status
    transaction.status = 'failed';
    transaction.failureReason = reason || 'Rejected by admin';
    transaction.metadata.adminNote = `Rejected by ${admin.name}: ${reason}`;

    await transaction.save();

    res.json({
      success: true,
      message: transaction.type === 'withdraw' ? "Withdrawal request rejected" : "Deposit request rejected",
      transaction: transaction
    });

  } catch (err) {
    console.error("Reject deposit error:", err);
    res.status(500).json({ success: false, message: "Failed to reject deposit" });
  }
});

module.exports = router;