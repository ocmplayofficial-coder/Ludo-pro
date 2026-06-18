// server/controllers/withdraw.controller.js
import mongoose from "mongoose";
import { WithdrawRequestModel } from "../models/withdrawRequest.model.js";
import { UserModel } from "../models/user.model.js";
import { TransactionModel } from "../models/transaction.model.js";

export const WithdrawController = {
  // User creates a withdraw request
  async createRequest(req, res) {
    try {
      const userId = req.user.id; // auth middleware sets req.user
      const { amount, upiId } = req.body;
      const numericAmount = Number(amount);
      if (!numericAmount || numericAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount" });
      }
      if (!upiId || typeof upiId !== "string" || upiId.trim().length === 0) {
        return res.status(400).json({ success: false, message: "UPI ID required" });
      }

      // Verify user has sufficient balance (deposit + winnings)
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      const availableBalance = (user.depositBalance || 0) + (user.winningsBalance || 0);
      if (numericAmount > availableBalance) {
        return res.status(400).json({ success: false, message: "Insufficient balance" });
      }

      const withdrawRequest = await WithdrawRequestModel.create({
        user: userId,
        upiId: upiId.trim(),
        amount: numericAmount,
        status: "PENDING"
      });

      return res.status(201).json({ success: true, withdrawRequest });
    } catch (err) {
      console.error("CREATE_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin approves a withdraw request
  async approve(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { id } = req.params;
      const withdraw = await WithdrawRequestModel.findById(id).session(session);
      if (!withdraw) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Withdraw request not found" });
      }
      if (withdraw.status !== "PENDING") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Already processed" });
      }

      const user = await UserModel.findById(withdraw.user).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Deduct amount
      const totalBalance = (user.depositBalance || 0) + (user.winningsBalance || 0);
      if (withdraw.amount > totalBalance) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "User balance changed, insufficient funds" });
      }

      // Simple logic: deduct from deposit first, then winnings
      let remaining = withdraw.amount;
      if (user.depositBalance >= remaining) {
        user.depositBalance -= remaining;
        remaining = 0;
      } else {
        remaining -= user.depositBalance;
        user.depositBalance = 0;
        if (user.winningsBalance >= remaining) {
          user.winningsBalance -= remaining;
          remaining = 0;
        } else {
          // Should not happen due to earlier check
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: "Insufficient internal balance" });
        }
      }
      user.walletBalance = (user.depositBalance || 0) + (user.winningsBalance || 0);
      await user.save({ session });

      withdraw.status = "APPROVED";
      await withdraw.save({ session });

      // Record transaction for audit
      await TransactionModel.create([
        {
          user: user._id,
          type: "WITHDRAW",
          amount: withdraw.amount,
          status: "SUCCESS",
          method: "UPI",
          paymentMethod: null
        }
      ], { session });

      await session.commitTransaction();
      session.endSession();

      // Emit socket event to user if socket server is available
      if (global.io) {
        global.io.to(user._id.toString()).emit("walletUpdated", {
          depositBalance: user.depositBalance,
          winningsBalance: user.winningsBalance,
          walletBalance: user.walletBalance
        });
      }

      return res.json({ success: true, withdraw });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("APPROVE_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin rejects a withdraw request
  async reject(req, res) {
    try {
      const { id } = req.params;
      const withdraw = await WithdrawRequestModel.findById(id);
      if (!withdraw) {
        return res.status(404).json({ success: false, message: "Withdraw request not found" });
      }
      if (withdraw.status !== "PENDING") {
        return res.status(400).json({ success: false, message: "Already processed" });
      }
      withdraw.status = "REJECTED";
      await withdraw.save();
      return res.json({ success: true, withdraw });
    } catch (err) {
      console.error("REJECT_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // List withdraw requests (admin view)
  async list(req, res) {
    try {
      const withdraws = await WithdrawRequestModel.find()
        .populate("user", "username phoneNumber")
        .sort({ createdAt: -1 });
      return res.json({ success: true, withdraws });
    } catch (err) {
      console.error("LIST_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};
