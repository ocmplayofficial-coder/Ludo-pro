// server/models/withdrawRequest.model.js
import mongoose from "mongoose";

const withdrawRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    email: { type: String, default: "" },
    method: { type: String, enum: ["UPI", "BANK"], required: true },
    amount: { type: Number, required: true },
    accountHolderName: { type: String, required: true },
    upiId: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    bankName: { type: String },
    branchName: { type: String },
    mobileNumber: { type: String },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    remarks: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

export const WithdrawRequestModel = mongoose.model("WithdrawRequest", withdrawRequestSchema);

