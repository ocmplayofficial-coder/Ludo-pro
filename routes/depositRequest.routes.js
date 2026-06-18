import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { DepositRequestModel } from "../models/depositRequest.model.js";
import { PaymentMethodModel } from "../models/paymentMethod.model.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Create a new deposit request
router.post("/", authMiddleware, upload.single('screenshot'), async (req, res) => {
  try {
    const { amount, paymentMethodId, utrNumber } = req.body;
    const parsedAmount = parseFloat(amount);

    // Validate amount
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount. Must be greater than 0." });
    }
    // Validate payment method
    if (!paymentMethodId) {
      return res.status(400).json({ success: false, error: "Payment method ID is required." });
    }
    // Validate UTR number
    if (!utrNumber || utrNumber.trim().length < 10) {
      return res.status(400).json({ success: false, error: "UTR Number is required and must be at least 10 characters." });
    }
    // Check duplicate UTR
    const existing = await DepositRequestModel.findOne({ utrNumber: utrNumber.trim() });
    if (existing) {
      return res.status(409).json({ success: false, error: "A deposit request with this UTR number already exists." });
    }

    const paymentMethod = await PaymentMethodModel.findById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({ success: false, error: "Payment method not found." });
    }

    const depositData = {
      user: req.user._id,
      amount: parsedAmount,
      paymentMethod: paymentMethodId,
      utrNumber: utrNumber.trim(),
      status: "PENDING"
    };
    // If a screenshot file was uploaded, store its path
    if (req.file && req.file.path) {
      depositData.screenshot = req.file.path.replace(/\\/g, '/'); // normalize path
    }

    const depositRequest = await DepositRequestModel.create(depositData);

    return res.json({ success: true, message: "Deposit Request Submitted Successfully", depositRequest });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
