const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Deposit = require("../models/Deposit"); // Manual payment proof ke liye
const PaymentMethod = require("../models/PaymentMethod");
const auth = require("../middleware/authMiddleware");

/**
 * 💰 1. GET WALLET DETAILS
 */
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("wallet");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      // Total calculated balance
      balance: (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0), 
      deposit: user.wallet.deposit || 0,
      winning: user.wallet.winnings || 0,
      bonus: user.wallet.bonus || 0
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * 💳 2. INSTANT DEPOSIT (Internal/Automated)
 */
router.post("/deposit", auth, async (req, res) => {
  try {
    const { amount, paymentId } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ success: false, message: "Minimum deposit is ₹10" });
    }

    const user = await User.findById(req.user.id);
    const oldBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);

    user.wallet.deposit += numAmount;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "deposit",
      amount: numAmount,
      balanceBefore: oldBalance,
      balanceAfter: oldBalance + numAmount,
      status: "success",
      paymentId: paymentId || "INSTANT_PAY",
      description: "Cash added successfully"
    });

    res.json({ success: true, balance: user.wallet.deposit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 💸 3. WITHDRAW (WINNINGS ONLY)
 */
router.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount, bankDetails } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is ₹10" });
    }

    if (!bankDetails || typeof bankDetails !== "object") {
      return res.status(400).json({ success: false, message: "Bank details are required for withdrawal" });
    }

    const accountHolderName = String(bankDetails.accountHolderName || bankDetails.name || "").trim();
    const bankName = String(bankDetails.bankName || bankDetails.bank || "").trim();
    const accountNumber = String(bankDetails.accountNumber || "").trim();
    const ifsc = String(bankDetails.ifsc || "").trim();

    if (!accountHolderName || !bankName || !accountNumber || !ifsc) {
      return res.status(400).json({ success: false, message: "Complete bank details are required for withdrawal" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if ((user.wallet.winnings || 0) < numAmount) {
      return res.status(400).json({ success: false, message: "Withdrawal cannot exceed winnings balance" });
    }

    const oldBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);

    user.wallet.winnings -= numAmount;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "withdraw",
      amount: numAmount,
      balanceBefore: oldBalance,
      balanceAfter: oldBalance - numAmount,
      status: "pending",
      walletSource: "winning",
      description: "Withdrawal request pending admin approval",
      bankDetails: {
        accountHolderName,
        bankName,
        accountNumber,
        ifsc
      }
    });

    res.json({ success: true, message: "Withdrawal request placed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 📱 4. GET PAYMENT INFO (DYNAMIC ROTATION)
 * Frontend call karega QR/UPI combo lene ke liye
 */
const getRotatedMethod = async (req, res) => {
  try {
    const qrMethod = await PaymentMethod.findOne({ type: "qr", status: "active" }).sort({ usageCount: 1 });
    const upiMethod = await PaymentMethod.findOne({ type: "upi", status: "active" }).sort({ usageCount: 1 });

    if (!qrMethod && !upiMethod) {
      return res.status(404).json({ success: false, message: "No payment methods available" });
    }

    if (qrMethod) {
      qrMethod.usageCount = (qrMethod.usageCount || 0) + 1;
      await qrMethod.save();
    }
    if (upiMethod) {
      upiMethod.usageCount = (upiMethod.usageCount || 0) + 1;
      await upiMethod.save();
    }

    res.json({
      success: true,
      upiId: upiMethod ? upiMethod.upiId : "",
      qrUrl: qrMethod ? qrMethod.qrImageUrl : null,
      qrImageUrl: qrMethod ? qrMethod.qrImageUrl : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.get("/payment-info", getRotatedMethod);
router.get("/get-payment-method", getRotatedMethod);

/**
 * 💰 5. CREATE DEPOSIT REQUEST (MANUAL UTR SUBMISSION)
 */
router.post("/create-deposit", auth, async (req, res) => {
  try {
    const { amount, transactionId } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ success: false, message: "Minimum deposit is ₹10" });
    }

    if (!transactionId || transactionId.trim().length < 12) {
      return res.status(400).json({ success: false, message: "Valid 12-digit UTR is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // 1. Create entry for Admin Verification (Financial Ledger)
    const deposit = await Deposit.create({
      userId: user._id,
      name: user.name,
      amount: numAmount,
      transactionId: transactionId.trim(),
      status: 'pending',
      description: "Wallet Deposit (Awaiting Approval)"
    });

    const currentBalance = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);

    // 2. Add to user's transaction history as 'pending'
    await Transaction.create({
      userId: user._id,
      type: "deposit",
      amount: numAmount,
      balanceBefore: currentBalance,
      balanceAfter: currentBalance,
      status: "pending",
      paymentMethod: "manual",
      paymentId: transactionId.trim(),
      description: "Manual deposit pending admin approval",
      metadata: {
        adminNote: "Awaiting admin approval",
        transactionOrigin: "manual_utr"
      }
    });

    res.json({
      success: true,
      message: "UTR submitted successfully! Balance will be added after verification.",
      depositId: deposit._id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 📜 6. TRANSACTION HISTORY
 */
router.get("/transactions", auth, async (req, res) => {
  try {
    const history = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ success: true, transactions: history });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;