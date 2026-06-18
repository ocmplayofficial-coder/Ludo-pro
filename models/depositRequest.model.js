import mongoose from "mongoose";

const depositRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true
    },
    utrNumber: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 30
    },
    screenshot: {
      type: String,
      required: false
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    }
  },
  {
    timestamps: true
  }
);

export const DepositRequestModel = mongoose.model(
  "DepositRequest",
  depositRequestSchema
);
