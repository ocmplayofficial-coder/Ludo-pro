import mongoose from "mongoose";

const upiOrderSchema = new mongoose.Schema(
  {
    clientTxnId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED"], default: "PENDING" },
    gatewayTxnId: { type: String, index: true, sparse: true },
    paymentUrl: { type: String },
    processed: { type: Boolean, default: false },
    rawPayload: { type: Object },
  },
  { timestamps: true }
);

export const UpigatewayOrderModel = mongoose.model("UpigatewayOrder", upiOrderSchema);
