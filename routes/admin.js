const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const PaymentMethod = require("../models/PaymentMethod");
const upload = require("../middleware/upload");
const auth = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const adminController = require("../controllers/adminController");

// ============================================
// 🔐 ADMIN ROUTES (Explicit Auth)
// ============================================

// --- 📊 DASHBOARD & STATS ---
router.get("/stats", auth, roleMiddleware("admin", "super-admin"), adminController.getStatsApi);
router.get("/dashboard-stats", auth, roleMiddleware("admin", "super-admin"), adminController.getDashboardStats);
router.get("/financial-stats", auth, roleMiddleware("admin", "super-admin"), adminController.getFinancialStats);
router.get("/analytics/revenue", auth, roleMiddleware("admin", "super-admin"), adminController.getRevenueAnalytics);

// --- 👥 USER MANAGEMENT ---
router.get("/users/all", auth, roleMiddleware("admin", "super-admin"), adminController.getAllUsers);
router.get("/live-matches", auth, roleMiddleware("admin", "super-admin"), adminController.getLiveMatches);

router.post("/users/update-wallet", auth, roleMiddleware("admin", "super-admin"), async (req, res) => {
  try {
    const { userId, amount, type } = req.body;
    const numericAmount = Number(amount) || 0;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (type === "deposit") {
      user.wallet.deposit = (user.wallet.deposit || 0) + numericAmount;
    } else if (type === "withdraw") {
      if ((user.wallet.deposit || 0) < numericAmount) {
        return res.json({ success: false, message: "Insufficient Balance" });
      }
      user.wallet.deposit -= numericAmount;
    } else {
      return res.status(400).json({ success: false, message: "Invalid wallet update type" });
    }

    await user.save();
    res.json({ success: true, message: "Wallet updated", user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/users/ban", auth, roleMiddleware("admin", "super-admin"), async (req, res) => {
  try {
    const { userId, status } = req.body;
    const update = {};

    if (typeof status === "boolean") {
      update.status = status ? "blocked" : "active";
    } else if (["active", "blocked", "suspended"].includes(status)) {
      update.status = status;
    } else {
      update.status = "blocked";
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User status updated", user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- 💰 TRANSACTIONS ---
router.get("/transactions", auth, roleMiddleware("admin", "super-admin"), adminController.getTransactions);
router.get("/tournaments", auth, roleMiddleware("admin", "super-admin"), adminController.getAllTournaments);
router.get("/tournaments/all", auth, roleMiddleware("admin", "super-admin"), adminController.getAllTournaments);
router.post("/tournaments/create", auth, roleMiddleware("admin", "super-admin"), adminController.createTournament);
router.put("/transactions/:id/approve", auth, roleMiddleware("admin", "super-admin"), adminController.approveAdminTransaction);
router.post("/transactions/:id/approve", auth, roleMiddleware("admin", "super-admin"), adminController.approveAdminTransaction);
router.put("/transactions/:id/reject", auth, roleMiddleware("admin", "super-admin"), adminController.rejectAdminTransaction);
router.post("/transactions/:id/reject", auth, roleMiddleware("admin", "super-admin"), adminController.rejectAdminTransaction);
router.post("/transactions/approve/:depositId", auth, roleMiddleware("admin", "super-admin"), adminController.approveTransaction);
router.put("/transactions/approve/:transactionId", auth, roleMiddleware("admin", "super-admin"), adminController.approveTransaction);
router.post("/transactions/reject/:transactionId", auth, roleMiddleware("admin", "super-admin"), adminController.rejectTransaction);
router.put("/transactions/reject/:transactionId", auth, roleMiddleware("admin", "super-admin"), adminController.rejectTransaction);
router.post("/transaction/update", auth, roleMiddleware("admin", "super-admin"), adminController.updateTransaction);
router.post("/manageTransaction/:id", auth, roleMiddleware("admin", "super-admin"), async (req, res) => {
  const transactionId = req.params.id;
  console.log(`[ADMIN ROUTE] manageTransaction hit for id=${transactionId}`);

  try {
    const { amount } = req.body;
    const transaction =
      (await Transaction.findById(transactionId)) ||
      (await Transaction.findOne({ transactionId }));

    if (!transaction) {
      console.log(`[ADMIN ROUTE] manageTransaction not found: ${transactionId}`);
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status === "success") {
      return res.status(400).json({ success: false, message: "Transaction is already approved" });
    }

    const user = await User.findById(transaction.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Associated user not found" });
    }

    const approvedAmount = Number(amount || transaction.amount || 0);
    if (!approvedAmount || approvedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid approved amount is required" });
    }

    let saveUser = false;
    if (transaction.type === "deposit") {
      const currentDeposit = user.wallet.deposit || 0;
      user.wallet.deposit = currentDeposit + approvedAmount;
      transaction.balanceAfter = (transaction.balanceBefore || 0) + approvedAmount;
      saveUser = true;
    } else if (transaction.type === "withdraw") {
      if (approvedAmount !== Number(transaction.amount || 0)) {
        return res.status(400).json({ success: false, message: "Approved amount must match requested withdraw amount" });
      }
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore || 0) - approvedAmount;
    } else {
      return res.status(400).json({ success: false, message: "Unsupported transaction type for manageTransaction" });
    }

    transaction.status = "success";
    transaction.amount = approvedAmount;
    transaction.metadata = transaction.metadata || {};
    transaction.metadata.adminNote = `Approved by admin via manageTransaction on ${new Date().toISOString()}`;

    if (saveUser) {
      await Promise.all([user.save(), transaction.save()]);
    } else {
      await transaction.save();
    }

    return res.json({
      success: true,
      message: transaction.type === 'withdraw'
        ? `Withdrawal approved for ₹${transaction.amount}`
        : "Transaction approved and wallet updated",
      transaction
    });
  } catch (err) {
    console.error("[ADMIN ROUTE] manageTransaction error:", err);
    return res.status(500).json({ success: false, message: "Server error while approving transaction" });
  }
});

// ======================================================
// 💳 PAYMENT METHODS (QR & UPI ROTATION SYSTEM)
// ======================================================

// 1. Fetch All Methods (Frontend array expect karta hai)
router.get("/payment-methods/all", auth, adminController.getAllPaymentMethods);

// 2. Add New Method (Combined Route for QR & UPI)
router.post("/payment-methods/add", auth, upload.single("qrImage"), async (req, res) => {
  try {
    const { type, upiId, name } = req.body;
    let qrImageUrl = null;

    if (type === "qr" && req.file) {
      qrImageUrl = `uploads/qrs/${req.file.filename}`;
    }

    // Validation
    if (type === "upi" && !upiId) {
      return res.status(400).json({ success: false, message: "UPI ID is required" });
    }
    if (type === "qr" && !req.file) {
      return res.status(400).json({ success: false, message: "QR Image is required" });
    }

    const newMethod = new PaymentMethod({
      type,
      upiId: type === "upi" ? upiId : null,
      qrImageUrl: type === "qr" ? qrImageUrl : null,
      name: name || (type === "qr" ? "QR Payment" : "UPI Payment"),
      status: "active",
      usageCount: 0
    });

    await newMethod.save();
    res.status(200).json({ success: true, message: "Method Added!" });
  } catch (err) {
    console.error("❌ Add Method Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Backward Compatibility Routes (Aapke frontend ke liye)
router.post("/payment-methods/add-upi", async (req, res) => {
  const { upiId, name } = req.body;
  const newUpi = new PaymentMethod({ type: "upi", upiId, name, status: "active" });
  await newUpi.save();
  res.status(200).json({ success: true });
});

router.post("/payment-methods/add-qr", upload.single("qrImage"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "File missing" });
  const newQr = new PaymentMethod({ 
    type: "qr", 
    qrImageUrl: `uploads/qrs/${req.file.filename}`, 
    status: "active" 
  });
  await newQr.save();
  res.status(200).json({ success: true });
});

// 4. Remove Method
router.delete("/payment-methods/remove/:id", async (req, res) => {
  try {
    await PaymentMethod.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Removed!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- 🎮 GAME & TOURNAMENT ---
router.post("/create-game", auth, adminController.createGameTable);

module.exports = router;