const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { auth } = require("./auth");

/**
 * 💰 1. CREATE DEPOSIT REQUEST (MANUAL PAYMENT PROOF)
 * Player submits payment proof for admin verification
 */
router.post("/deposit-request", auth, async (req, res) => {
  const { amount, transactionId } = req.body;

  try {
    // Validation
    if (!amount || amount < 10) {
      return res.status(400).json({ success: false, message: "Minimum deposit ₹10" });
    }

    if (!transactionId || transactionId.trim().length < 5) {
      return res.status(400).json({ success: false, message: "Valid Transaction ID required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get current balance for tracking
    const currentBalance = Number(user.wallet.balance);

    // Create transaction record with pending status
    const newTx = new Transaction({
      userId: req.user.id,
      type: 'deposit',
      amount: Number(amount),
      paymentId: transactionId.trim(), // Store UTR/TXN ID here
      paymentMethod: 'manual', // Manual UPI payment
      status: 'pending', // Admin will approve later
      balanceBefore: currentBalance,
      balanceAfter: currentBalance, // Will update on approval
      description: `Deposit request: ₹${amount} via UPI (UTR: ${transactionId.trim()})`,
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

    // Update transaction status
    transaction.status = 'success';
    transaction.metadata.adminNote = `Approved by ${admin.name} on ${new Date().toISOString()}`;

    let user;
    if (transaction.type === 'deposit') {
      user = await User.findById(transaction.userId);
      transaction.balanceAfter = transaction.balanceBefore + transaction.amount;
      if (user) {
        user.wallet.deposit = (user.wallet.deposit || 0) + transaction.amount;
        await user.save();
      }
    } else if (transaction.type === 'withdraw') {
      // Withdraw was already deducted at request time; do not modify wallet again
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore - transaction.amount);
    } else {
      transaction.balanceAfter = transaction.balanceAfter || transaction.balanceBefore;
    }

    await transaction.save();

    res.json({
      success: true,
      message: transaction.type === 'withdraw'
        ? `Withdrawal approved for ₹${transaction.amount}`
        : `Deposit approved! ₹${transaction.amount} credited to ${user ? user.name : 'user'}`,
      transaction: transaction
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

    // Update transaction status
    transaction.status = 'success';
    transaction.metadata.adminNote = `Approved by ${admin.name} on ${new Date().toISOString()}`;

    let user;
    if (transaction.type === 'deposit') {
      user = await User.findById(transaction.userId);
      transaction.balanceAfter = transaction.balanceBefore + transaction.amount;
      if (user) {
        user.wallet.deposit = (user.wallet.deposit || 0) + transaction.amount;
        await user.save();
      }
    } else if (transaction.type === 'withdraw') {
      // Withdraw was already deducted at request time; do not modify wallet again
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore - transaction.amount);
    } else {
      transaction.balanceAfter = transaction.balanceAfter || transaction.balanceBefore;
    }

    await transaction.save();

    res.json({
      success: true,
      message: transaction.type === 'withdraw'
        ? `Withdrawal approved for ₹${transaction.amount}`
        : `Deposit approved! ₹${transaction.amount} credited to ${user ? user.name : 'user'}`,
      transaction: transaction
    });

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