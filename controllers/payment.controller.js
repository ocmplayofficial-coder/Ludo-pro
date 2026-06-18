// server/controllers/payment.controller.js
import Razorpay from "razorpay";
import crypto from "crypto";
import { TransactionModel } from "../models/transaction.model.js";
import { PaymentMethodModel } from "../models/paymentMethod.model.js";
import { UserModel } from "../models/user.model.js";
import { env } from "../config/env.js";
const io = global.io; // using global.io set by server.js

// Initialize Razorpay instance (replace with real keys in .env)
// Initialize Razorpay instance if credentials are provided
const razorpay = (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) ? new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
}) : null;

export class PaymentController {
  /**
   * Create a payment order for a given amount and payment method.
   * Returns the order id and a QR / UPI intent that the frontend can display.
   */
  static async createOrder(req, res) {
    try {
      console.log("CREATE_ORDER_REQUEST", req.body);
      console.log("PAYMENT_GATEWAY_CONFIG", { 
         RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID ? "***" : "missing", 
         RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET ? "***" : "missing" 
      });

      const { amount, paymentMethodId } = req.body;
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
      }
      if (!paymentMethodId) {
        return res.status(400).json({ success: false, error: "Payment method required" });
      }
      // Verify payment method exists and is active
      const paymentMethod = await PaymentMethodModel.findById(paymentMethodId);
      console.log("ACTIVE_PAYMENT_METHOD", paymentMethod);
      if (!paymentMethod || !paymentMethod.active) {
        return res.status(404).json({ success: false, error: "Payment method not found" });
      }

      // If Razorpay is missing, generate a manual local tracking order
      let razorOrderId = `manual_order_${Date.now()}`;
      let paymentLink = "manual_transfer";
      let mode = "manual_upi";

      if (razorpay) {
        try {
          // Razorpay order amount is in paise (integer)
          const orderAmount = Math.round(parsedAmount * 100);
          const razorOrder = await razorpay.orders.create({
            amount: orderAmount,
            currency: "INR",
            receipt: `order_rcpt_${Date.now()}`,
            notes: { userId: req.user._id.toString(), paymentMethodId },
          });
          razorOrderId = razorOrder.id;
          paymentLink = `https://checkout.razorpay.com/v1/checkout.js?order_id=${razorOrder.id}`;
          mode = "razorpay";
        } catch (gatewayErr) {
          console.warn("Razorpay order creation failed, falling back to manual mode:", gatewayErr.message);
          // Fall back to manual mode gracefully
        }
      }

      // Attempt to create a transaction with a unique transactionId.
      // Retry on duplicate-key errors (E11000) a few times to avoid collisions.
      let pendingTx = null;
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2,8)}`;
        try {
          pendingTx = await TransactionModel.create({
            user: req.user._id,
            amount: parsedAmount,
            type: "DEPOSIT",
            status: "PENDING",
            gatewayOrderId: razorOrderId,
            transactionId,
            paymentMethod: paymentMethodId,
            method: paymentMethod.type === "upi" ? paymentMethod.upiId : (paymentMethod.type === "qr" ? "QR Scan" : "Razorpay"),
          });
          break; // success
        } catch (createErr) {
          // If duplicate key on transactionId, retry generating a new id
          if (createErr && createErr.code === 11000 && attempt < maxAttempts - 1) {
            console.warn(`Duplicate transactionId detected, retrying (${attempt + 1})`);
            await new Promise(r => setTimeout(r, 50));
            continue;
          }
          // otherwise rethrow
          throw createErr;
        }
      }

      if (!pendingTx) {
        throw new Error('Failed to create pending transaction after multiple attempts');
      }

      return res.json({
        success: true,
        order: {
           amount: parsedAmount,
           paymentMethodId: paymentMethod._id,
           upiId: paymentMethod.upiId || "",
           qrCode: paymentMethod.qrImage ? `/uploads/${paymentMethod.qrImage}` : "",
           mode: mode
        },
        orderId: razorOrderId,
        paymentLink
      });
    } catch (err) {
      console.error("CREATE_ORDER_ERROR", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Webhook endpoint to receive payment status from Razorpay.
   * Verifies signature, updates transaction, credits user wallet, and emits socket event.
   */
  static async handleWebhook(req, res) {
    try {
      const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
      const receivedSignature = req.headers["x-razorpay-signature"];
      const generatedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(req.body)
        .digest("hex");
      if (generatedSignature !== receivedSignature) {
        console.warn("Invalid Razorpay webhook signature");
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }
      const payload = JSON.parse(req.body);
      const event = payload.event;

      if (event !== "payment.captured" && event !== "payment.failed") {
        // ignore other events
        return res.json({ success: true });
      }

      const payment = payload.payload.payment.entity;
      const orderId = payment.order_id;
      const amount = payment.amount / 100; // convert back to rupees

      // Find transaction by gatewayOrderId
      const tx = await TransactionModel.findOne({ gatewayOrderId: orderId });
      if (!tx) {
        console.warn("Transaction not found for order", orderId);
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

      // Idempotency – if already SUCCESS, ignore
      if (tx.status === "SUCCESS") {
        return res.json({ success: true });
      }

      // Update transaction status based on event
      const newStatus = event === "payment.captured" ? "SUCCESS" : "FAILED";
      tx.status = newStatus;
      await tx.save();

      if (newStatus === "SUCCESS") {
        // Credit user wallet atomically
        const session = await TransactionModel.startSession();
        session.startTransaction();
        try {
          const user = await UserModel.findById(tx.user).session(session);
          if (!user) throw new Error("User not found");
          user.depositBalance += amount;
          user.walletBalance = (user.depositBalance || 0) + (user.winningsBalance || 0);
          await user.save({ session });
          await session.commitTransaction();

          // Emit real‑time update via Socket.IO (user‑specific room)
          if (io) {
            io.to(user._id.toString()).emit("walletUpdated", {
              balance: user.walletBalance,
            });
          }
        } catch (e) {
          await session.abortTransaction();
          throw e;
        } finally {
          session.endSession();
        }
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("WEBHOOK_ERROR", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}
