import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  // Unique transaction identifier used by the application (not gateway id)
  transactionId: { type: String, unique: true, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  paymentMethod: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod" },
  type: { type: String, enum: ["DEPOSIT", "WITHDRAW", "CONVERT"], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED", "APPROVED", "REJECTED"], default: "PENDING" },
  gatewayOrderId: { type: String, unique: true, sparse: true },
  // transactionId may have a unique index in the DB; we populate it when creating transactions
  // to avoid duplicate-key errors caused by null values.
  method: { type: String, default: "UPI Gateway" },
  createdAt: { type: Date, default: Date.now }
});

export const TransactionModel = mongoose.model("Transaction", transactionSchema);

