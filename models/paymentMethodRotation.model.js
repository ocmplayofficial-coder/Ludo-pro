// Rotation counter for payment methods (round‑robin)
import mongoose from "mongoose";

const paymentMethodRotationSchema = new mongoose.Schema({
  counter: { type: Number, default: 0 }
}, { timestamps: true });

export const PaymentMethodRotationModel = mongoose.model(
  "PaymentMethodRotation",
  paymentMethodRotationSchema
);
