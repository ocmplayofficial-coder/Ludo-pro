import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { PaymentMethodModel } from "../models/paymentMethod.model.js";

const router = express.Router();

router.get("/active", authMiddleware, async (req, res) => {
  try {
    const activeMethod = await PaymentMethodModel.findOne({ active: true });
    if (!activeMethod) {
      return res.status(404).json({
        success: false,
        error: "No active payment method configured by admin"
      });
    }
    return res.json({
      success: true,
      _id: activeMethod._id,
      upiId: activeMethod.upiId,
      qrCode: activeMethod.qrImage ? `/uploads/${activeMethod.qrImage}` : "",
      type: activeMethod.type
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET next payment method in round-robin rotation
router.get('/next', authMiddleware, async (req, res) => {
  try {
    // Fetch all active payment methods sorted by creation order
    const activeMethods = await PaymentMethodModel.find({ active: true }).sort({ _id: 1 });
    if (!activeMethods.length) {
      return res.status(404).json({ success: false, error: 'No active payment methods configured by admin' });
    }
    // Use or create a rotation counter document to keep track of the next index
    const rotationDoc = await (await import('../models/paymentMethodRotation.model.js')).PaymentMethodRotationModel.findOneAndUpdate(
      {},
      { $inc: { counter: 1 } },
      { new: true, upsert: true }
    );
    // Compute zero‑based index
    const index = (rotationDoc.counter - 1) % activeMethods.length;
    const method = activeMethods[index];
    return res.json({
      success: true,
      _id: method._id,
      upiId: method.upiId,
      qrCode: method.qrImage ? `/uploads/${method.qrImage}` : '',
      type: method.type
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
export default router;
