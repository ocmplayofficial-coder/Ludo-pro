// server/controllers/withdraw.controller.js
import mongoose from "mongoose";
import { WithdrawRequestModel } from "../models/withdrawRequest.model.js";
import { UserModel } from "../models/user.model.js";
import { TransactionModel } from "../models/transaction.model.js";

const MIN_WITHDRAW_AMOUNT = 100;

export const WithdrawController = {
  // User creates a withdraw request
  async createRequest(req, res) {
    try {
      const userId = req.user._id;
      const {
        method,
        amount,
        accountHolderName,
        upiId,
        accountNumber,
        confirmAccountNumber,
        ifscCode,
        bankName,
        branchName,
        mobileNumber
      } = req.body;

      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount value." });
      }

      if (numericAmount < MIN_WITHDRAW_AMOUNT) {
        return res.status(400).json({
          success: false,
          message: `Amount must be greater than or equal to minimum withdrawal of ₹${MIN_WITHDRAW_AMOUNT}.`
        });
      }

      // Check user's winnings balance
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User profile not found." });
      }

      if (numericAmount > (user.winningsBalance || 0)) {
        return res.status(400).json({
          success: false,
          message: `Amount cannot exceed your withdrawable winnings balance of ₹${(user.winningsBalance || 0).toFixed(2)}.`
        });
      }

      if (!method || !["UPI", "BANK"].includes(method)) {
        return res.status(400).json({ success: false, message: "Valid withdrawal method (UPI or BANK) is required." });
      }

      if (!accountHolderName || accountHolderName.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Account Holder Name is required." });
      }

      const requestPayload = {
        userId,
        username: user.username,
        email: user.phoneNumber || "", // using phone number as backup or email if available
        method,
        amount: numericAmount,
        accountHolderName: accountHolderName.trim()
      };

      if (method === "UPI") {
        if (!upiId || upiId.trim().length === 0) {
          return res.status(400).json({ success: false, message: "UPI ID is required." });
        }
        requestPayload.upiId = upiId.trim();
      } else {
        // Bank transfer details validation
        if (!accountNumber || accountNumber.trim().length === 0) {
          return res.status(400).json({ success: false, message: "Account Number is required." });
        }
        if (accountNumber !== confirmAccountNumber) {
          return res.status(400).json({ success: false, message: "Account Number and Confirm Account Number do not match." });
        }
        if (!ifscCode || ifscCode.trim().length === 0) {
          return res.status(400).json({ success: false, message: "IFSC Code is required." });
        }

        // IFSC validation (standard Indian banking regex: 4 chars, 0, 6 alpha/numeric)
        const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
        if (!ifscRegex.test(ifscCode.toUpperCase().trim())) {
          return res.status(400).json({ success: false, message: "Invalid IFSC Code format. E.g. SBIN0001234" });
        }

        if (!bankName || bankName.trim().length === 0) {
          return res.status(400).json({ success: false, message: "Bank Name is required." });
        }
        if (!branchName || branchName.trim().length === 0) {
          return res.status(400).json({ success: false, message: "Branch Name is required." });
        }
        if (!mobileNumber || mobileNumber.trim().length === 0) {
          return res.status(400).json({ success: false, message: "Mobile Number is required." });
        }

        requestPayload.accountNumber = accountNumber.trim();
        requestPayload.ifscCode = ifscCode.toUpperCase().trim();
        requestPayload.bankName = bankName.trim();
        requestPayload.branchName = branchName.trim();
        requestPayload.mobileNumber = mobileNumber.trim();
      }

      const withdrawRequest = await WithdrawRequestModel.create(requestPayload);

      // Add a PENDING notification inside user document
      const notifId = "NOTIF" + Date.now() + Math.floor(Math.random() * 1000);
      user.notifications.push({
        id: notifId,
        message: `Your withdrawal request of ₹${numericAmount} has been submitted and is PENDING approval.`,
        read: false,
        createdAt: new Date()
      });
      await user.save();

      return res.status(201).json({ success: true, withdrawRequest });
    } catch (err) {
      console.error("CREATE_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // User gets withdrawal history
  async getHistory(req, res) {
    try {
      const userId = req.user._id;
      const history = await WithdrawRequestModel.find({ userId })
        .sort({ createdAt: -1 });

      return res.json({ success: true, withdraws: history });
    } catch (err) {
      console.error("GET_WITHDRAW_HISTORY_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin lists all requests with searching, filtering, and pagination
  async adminList(req, res) {
    try {
      const { search, status, sortBy = "-createdAt", page = 1, limit = 10 } = req.query;

      const query = {};

      if (status && status !== "ALL") {
        query.status = status;
      }

      if (search && search.trim().length > 0) {
        query.username = { $regex: search.trim(), $options: "i" };
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.max(1, parseInt(limit));
      const skip = (pageNum - 1) * limitNum;

      const sortOption = {};
      if (sortBy.startsWith("-")) {
        sortOption[sortBy.substring(1)] = -1;
      } else {
        sortOption[sortBy] = 1;
      }

      const totalRequests = await WithdrawRequestModel.countDocuments(query);
      const requests = await WithdrawRequestModel.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate("userId", "username phoneNumber");

      return res.json({
        success: true,
        withdraws: requests,
        pagination: {
          total: totalRequests,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalRequests / limitNum)
        }
      });
    } catch (err) {
      console.error("ADMIN_LIST_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin gets specific withdraw details
  async adminGetDetails(req, res) {
    try {
      const { id } = req.params;
      const request = await WithdrawRequestModel.findById(id)
        .populate("userId", "username phoneNumber walletBalance winningsBalance depositBalance");

      if (!request) {
        return res.status(404).json({ success: false, message: "Withdraw request not found." });
      }

      return res.json({ success: true, withdraw: request });
    } catch (err) {
      console.error("ADMIN_GET_WITHDRAW_DETAIL_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin approves a withdraw request
  async adminApprove(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { id } = req.params;
      const withdraw = await WithdrawRequestModel.findById(id).session(session);
      if (!withdraw) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Withdraw request not found." });
      }

      if (withdraw.status !== "PENDING") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "This request has already been processed." });
      }

      const user = await UserModel.findById(withdraw.userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "User associated with this request not found." });
      }

      // Verify user has sufficient winnings balance at the moment of approval
      if (withdraw.amount > (user.winningsBalance || 0)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `User's balance has changed. Winnings balance (₹${user.winningsBalance}) is insufficient to cover this withdrawal (₹${withdraw.amount}).`
        });
      }

      // Deduct from winnings
      user.winningsBalance -= withdraw.amount;
      user.walletBalance = (user.depositBalance || 0) + user.winningsBalance;

      const notifId = "NOTIF" + Date.now() + Math.floor(Math.random() * 1000);
      user.notifications.push({
        id: notifId,
        message: `Your withdrawal request of ₹${withdraw.amount} has been APPROVED!`,
        read: false,
        createdAt: new Date()
      });
      await user.save({ session });

      withdraw.status = "APPROVED";
      withdraw.approvedBy = req.user.email || "admin";
      withdraw.approvedAt = new Date();
      await withdraw.save({ session });

      // Create transaction log
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const txMethod = withdraw.method === "UPI" 
        ? `UPI (${withdraw.upiId})` 
        : `Bank (${withdraw.bankName} - ...${withdraw.accountNumber?.slice(-4)})`;

      await TransactionModel.create([
        {
          transactionId,
          user: user._id,
          type: "WITHDRAW",
          amount: withdraw.amount,
          status: "SUCCESS",
          method: txMethod
        }
      ], { session });

      await session.commitTransaction();
      session.endSession();

      // Emit live updates to `/ludo` namespace user room
      if (global.ludoNamespace) {
        const userRoom = user._id.toString();
        global.ludoNamespace.to(userRoom).emit("walletUpdated", {
          depositBalance: user.depositBalance,
          winningsBalance: user.winningsBalance,
          walletBalance: user.walletBalance
        });

        global.ludoNamespace.to(userRoom).emit("withdrawNotification", {
          type: "APPROVED",
          message: `Your withdrawal request of ₹${withdraw.amount} has been APPROVED.`
        });
      }

      return res.json({ success: true, withdraw });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("ADMIN_APPROVE_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin rejects a withdraw request with remarks
  async adminReject(req, res) {
    try {
      const { id } = req.params;
      const { remarks } = req.body;

      if (!remarks || remarks.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Please provide a reason/remarks for rejection." });
      }

      const withdraw = await WithdrawRequestModel.findById(id);
      if (!withdraw) {
        return res.status(404).json({ success: false, message: "Withdraw request not found." });
      }

      if (withdraw.status !== "PENDING") {
        return res.status(400).json({ success: false, message: "This request has already been processed." });
      }

      withdraw.status = "REJECTED";
      withdraw.remarks = remarks.trim();
      withdraw.approvedBy = req.user.email || "admin";
      withdraw.approvedAt = new Date();
      await withdraw.save();

      const user = await UserModel.findById(withdraw.userId);
      if (user) {
        const notifId = "NOTIF" + Date.now() + Math.floor(Math.random() * 1000);
        user.notifications.push({
          id: notifId,
          message: `Your withdrawal request of ₹${withdraw.amount} was REJECTED. Reason: ${remarks}`,
          read: false,
          createdAt: new Date()
        });
        await user.save();

        // Emit live update to client
        if (global.ludoNamespace) {
          const userRoom = user._id.toString();
          global.ludoNamespace.to(userRoom).emit("withdrawNotification", {
            type: "REJECTED",
            message: `Your withdrawal request of ₹${withdraw.amount} has been REJECTED. Reason: ${remarks}`
          });
        }
      }

      return res.json({ success: true, withdraw });
    } catch (err) {
      console.error("ADMIN_REJECT_WITHDRAW_ERROR", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

