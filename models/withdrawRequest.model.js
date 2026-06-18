// server/models/withdrawRequest.model.js
import mongoose from "mongoose";

const withdrawRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  upiId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  gatewayOrderId: { type: String, unique: true, sparse: true }, // placeholder for future integration
  createdAt: { type: Date, default: Date.now }
});

export const WithdrawRequestModel = mongoose.model("WithdrawRequest", withdrawRequestSchema);
