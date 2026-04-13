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

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ success: false, message: "Already processed" });
    }

    if (transaction.type === "withdraw") {
      const user = await User.findById(transaction.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      console.log("Before:", user.wallet);

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

      console.log("After:", user.wallet);

      transaction.balanceAfter = (transaction.balanceBefore || 0) - withdrawalAmount;
    }

    transaction.status = "success";
    transaction.processedAt = new Date();
    await transaction.save();

    res.json({ success: true, message: "Transaction approved successfully", transaction });
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
