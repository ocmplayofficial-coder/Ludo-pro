const User = require("../models/User");
const Game = require("../models/Game");
const Transaction = require("../models/Transaction");
const Deposit = require("../models/Deposit");
const TPGame = require("../models/TPGame");
const Setting = require("../models/Setting");
const PaymentMethod = require("../models/PaymentMethod");
const Tournament = require("../models/Tournament");

/**
 * 📊 1. DASHBOARD OVERVIEW STATS
 */
exports.getStats = async (req, res) => {
  try {
    const [totalPlayers, onlinePlayers, totalLudo, totalTP, revenueData, activeLudoGames, activeTPGames, profitData] =
      await Promise.all([
        User.countDocuments({ role: "player" }),
        User.countDocuments({ isOnline: true }),
        Game.countDocuments(),
        TPGame.countDocuments(),
        Transaction.aggregate([
          { $match: { status: "success", type: "commission" } },
          { $group: { _id: null, totalProfit: { $sum: "$amount" } } }
        ]),
        Game.countDocuments({ status: "playing" }),
        TPGame.countDocuments({ status: "playing" }),
        Game.aggregate([
          { $match: { status: "finished" } },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $subtract: ["$prizeMoney", { $multiply: ["$entryFee", 2] }]
                }
              }
            }
          }
        ])
      ]);

    res.json({
      success: true,
      stats: {
        users: { 
          total: totalPlayers, 
          online: onlinePlayers || Object.keys(global.ACTIVE_PLAYERS || {}).length 
        },
        ludo: { total: totalLudo, active: activeLudoGames },
        teenPatti: { total: totalTP, active: activeTPGames },
        profit: revenueData[0]?.totalProfit || 0,
        adminProfit: Math.abs(profitData[0]?.total || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * � DASHBOARD SPECIFIC STATS
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Database se live data fetch karein
    const [totalUsers, onlinePlayers, liveLudoCount, liveTPCount, commissionData] = await Promise.all([
      User.countDocuments({ role: "player" }),
      User.countDocuments({ isOnline: true }),
      // 🔥 Card Fix: Count both 'playing' and 'active' matches to show on top
      Game.countDocuments({ status: { $in: ["playing", "active"] } }),
      TPGame.countDocuments({ status: { $in: ["playing", "active"] } }),
      Transaction.aggregate([
        { $match: { type: "commission", status: "success" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    // 2. Frontend naming convention ke hisaab se bhejien
    res.json({
      success: true,
      onlinePlayers: onlinePlayers || 0,
      totalRegistered: totalUsers || 0,
      adminProfit: commissionData[0]?.total || 0,
      liveLudo: liveLudoCount || 0,
      liveTeenPatti: liveTPCount || 0
    });
  } catch (err) {
    console.error("Dashboard Stats Error:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getLiveMatches = async (req, res) => {
  try {
    // Table mein wahi dikhao jo users ko dashboard par chahiye
    const ludoMatches = await Game.find({ status: { $in: ["playing", "active"] } })
      .select("gameType type mode status players createdAt entryFee roomId")
      .sort({ createdAt: -1 });

    const formattedMatches = ludoMatches.map(match => ({
      _id: match._id,
      roomId: match.roomId,
      gameName: `Ludo (${match.mode || match.type || 'Classic'})`,
      playersCount: match.players ? match.players.length : 0,
      status: match.status,
      entryFee: match.entryFee,
      startedAt: match.createdAt
    }));

    res.json({
      success: true,
      matches: formattedMatches || []
    });
  } catch (err) {
    console.error("❌ Live Matches Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStatsApi = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlinePlayers = await User.countDocuments({ isOnline: true });

    const profitData = await Transaction.aggregate([
      { $match: { type: "commission", status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    res.json({
      success: true,
      onlinePlayers,
      totalRegistered: totalUsers,
      totalProfit: profitData[0]?.total || 0,
      adminProfit: profitData[0]?.total || 0,
      recentMatches: []
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * �👥 2. USER MANAGEMENT
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find().sort({ createdAt: -1 });
    res.status(200).json(methods);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllTournaments = async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ createdAt: -1 }).lean();
    const normalized = tournaments.map((t) => ({
      ...t,
      players: Array.isArray(t.players) ? t.players : Array.isArray(t.joinedPlayers) ? t.joinedPlayers : [],
      maxPlayers: Number(t.maxPlayers || t.totalSlots || 0),
      name: t.name || t.title || "Untitled Tournament",
      status: t.status === "registration" ? "upcoming" : t.status === "active" ? "ongoing" : t.status || "upcoming"
    }));
    console.log("DB tournaments:", normalized.length);
    res.json({ success: true, tournaments: normalized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createTournament = async (req, res) => {
  try {
    const { name, gameType, entryFee, maxPlayers } = req.body;

    const tournament = await Tournament.create({
      name: name || req.body.title || "Untitled Tournament",
      gameType,
      entryFee: Number(entryFee) || 0,
      maxPlayers: Number(maxPlayers) || 2,
      players: [],
      status: "upcoming"
    });

    res.status(201).json({ success: true, tournament });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.banUser = async (req, res) => {
  try {
    const { userId, status } = req.body;
    const user = await User.findByIdAndUpdate(userId, { status }, { new: true });
    res.json({ success: true, message: `User is now ${status}`, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 💰 3. WALLET CONTROL
 */
exports.updateUserWallet = async (req, res) => {
  try {
    const { userId, amount, type } = req.body; // type: 'deposit' or 'winning'

    console.log(`💰 Updating Wallet: User ${userId}, Amount ${amount}, Type ${type}`);

    if (!userId || amount === undefined) {
      return res.status(400).json({ success: false, message: "Invalid Data" });
    }

    // Amount ko number mein convert karein
    const numAmount = Number(amount);

    // Dynamic field update logic
    const updateField = type === 'winning' ? "wallet.winnings" : "wallet.deposit";

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { [updateField]: numAmount } }, // $inc se balance add hoga
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ 
      success: true, 
      message: `₹${numAmount} added to ${type} successfully!`,
      wallet: user.wallet,
      newBalance: type === 'winning' ? user.wallet.winnings : user.wallet.deposit
    });

  } catch (err) {
    console.error("❌ WALLET_UPDATE_ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server Error: " + err.message });
  }
};

/**
 * ⚙️ 4. APP SETTINGS (UPI & QR)
 */
exports.getAppSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({
        upiId: "admin@upi",
        minDeposit: 100,
        maxDeposit: 10000,
        commissionLudo: 10,
        commissionTP: 5
      });
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching settings" });
  }
};

exports.updateAppSettings = async (req, res) => {
  try {
    const updateData = req.body;
    if (req.file) {
      updateData.qrCodeUrl = `/uploads/${req.file.filename}`;
    }
    const settings = await Setting.findOneAndUpdate({}, updateData, { new: true, upsert: true });
    res.json({ success: true, message: "Settings updated!", settings });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update" });
  }
};

/**
 * 📊 5. ANALYTICS FUNCTIONS
 */
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const revenueData = await Transaction.aggregate([
      { $match: { status: "success", type: { $in: ["deposit", "commission"] } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalRevenue: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);
    res.json({ success: true, revenueData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProfitAnalytics = async (req, res) => {
  try {
    const profitData = await Transaction.aggregate([
      { $match: { status: "success", type: "commission" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalProfit: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    res.json({ success: true, profitData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await User.find({ role: "player" })
      .select("name phone wallet winnings")
      .sort({ "wallet.winnings": -1 })
      .limit(10);
    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 🎮 6. GAME MANAGEMENT
 */
exports.getAllLudoGames = async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 }).limit(50).populate("players.userId", "name phone");
    res.json({ success: true, games });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getAllTPGames = async (req, res) => {
  try {
    const games = await TPGame.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, games });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate("userId", "name phone")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const normalized = transactions.map((transaction) => ({
      ...transaction,
      bankDetails: transaction.bankDetails
        ? { ...transaction.bankDetails, accountNumber: transaction.bankDetails.accountNumber }
        : transaction.bankDetails
    }));

    res.json({ success: true, transactions: normalized });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getFinancialStats = async (req, res) => {
  try {
    const deposits = await Transaction.aggregate([
      { $match: { type: "deposit", status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const withdrawals = await Transaction.aggregate([
      { $match: { type: "withdraw", status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    res.json({
      success: true,
      totalDeposits: deposits[0]?.total || 0,
      totalWithdrawals: withdrawals[0]?.total || 0,
      netRevenue: (deposits[0]?.total || 0) - (withdrawals[0]?.total || 0)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Stats sync failed" });
  }
};

exports.deleteGame = async (req, res) => {
  try {
    const { gameId, gameType } = req.body;
    if (gameType === "ludo") await Game.findByIdAndDelete(gameId);
    else await TPGame.findByIdAndDelete(gameId);
    res.json({ success: true, message: "Game deleted" });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

/**
 * 🆕 CREATE GAME TABLE
 * Admin can create a new game table for players to join
 */
exports.createGameTable = async (req, res) => {
  try {
    const { gameType, gameMode, entryFee, prizeAmount, maxPlayers } = req.body;

    if (!gameType || !gameMode || !entryFee || !prizeAmount) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const validGameType = ["ludo", "teenpatti"].includes(gameType) ? gameType : "ludo";
    const validGameMode = ["classic", "time", "turn"].includes(gameMode) ? gameMode : "classic";

    const newGame = await Game.create({
      gameType: validGameType,
      type: validGameMode,
      mode: validGameMode,
      entryFee: Number(entryFee),
      prizeMoney: Number(prizeAmount),
      maxPlayers: Number(maxPlayers) || 2,
      status: "active"
    });

    res.status(201).json({
      success: true,
      message: `${validGameType} ${validGameMode} created successfully!`,
      game: newGame
    });
  } catch (err) {
    console.error("❌ CREATE_GAME_ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server Error: " + err.message });
  }
};

// End Ludo & Set TP Commission needed for admin routes
exports.endLudoGame = async (req, res) => {
  try {
    await Game.findByIdAndUpdate(req.body.gameId, { status: "ended" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.setTPCommission = async (req, res) => {
  try {
    await Setting.findOneAndUpdate({}, { commissionTP: req.body.commission });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.updateTransaction = async (req, res) => {
  try {
    const { transactionId, status, amount } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: "transactionId is required" });
    }

    const transaction =
      (await Transaction.findById(transactionId)) ||
      (await Transaction.findOne({ transactionId }));

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const updates = {};
    if (typeof status === "string" && status.trim()) {
      updates.status = status.trim();
    }

    if (amount !== undefined && amount !== null) {
      const parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ success: false, message: "Valid amount is required" });
      }
      updates.amount = parsedAmount;
      if (transaction.type === "withdraw") {
        updates.balanceAfter = transaction.balanceBefore - parsedAmount;
      } else {
        updates.balanceAfter = transaction.balanceBefore + parsedAmount;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No update values provided" });
    }

    Object.assign(transaction, updates);
    transaction.metadata = transaction.metadata || {};
    transaction.metadata.adminNote = `Updated by admin on ${new Date().toISOString()}`;

    await transaction.save();

    res.json({ success: true, transaction });
  } catch (err) {
    console.error("Update transaction error:", err);
    res.status(500).json({ success: false, message: "Failed to update transaction" });
  }
};

exports.approveAdminTransaction = async (req, res) => {
  try {
    const transactionId = req.params.transactionId || req.params.id;
    const transaction =
      (await Transaction.findById(transactionId)) ||
      (await Transaction.findOne({ transactionId }));

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    transaction.status = "success";
    transaction.metadata = transaction.metadata || {};
    transaction.metadata.adminNote = `Approved by admin on ${new Date().toISOString()}`;

    await transaction.save();

    res.json({ success: true, message: "Transaction approved successfully", transaction });
  } catch (err) {
    console.error("Approve admin transaction error:", err);
    res.status(500).json({ success: false, message: "Failed to approve transaction" });
  }
};

exports.rejectAdminTransaction = async (req, res) => {
  try {
    const transactionId = req.params.transactionId || req.params.id;
    const { reason } = req.body;

    const transaction =
      (await Transaction.findById(transactionId)) ||
      (await Transaction.findOne({ transactionId }));

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    let user = null;
    if (transaction.type === "withdraw") {
      user = await User.findById(transaction.userId);
      if (user) {
        user.wallet.winnings = (user.wallet.winnings || 0) + (transaction.amount || 0);
        await user.save();
      }
      transaction.balanceAfter = transaction.balanceBefore;
    }

    transaction.status = "failed";
    transaction.failureReason = reason || "Rejected by admin";
    transaction.metadata = transaction.metadata || {};
    transaction.metadata.adminNote = `Rejected by admin on ${new Date().toISOString()}`;

    await transaction.save();

    res.json({ success: true, message: "Transaction rejected successfully", transaction });
  } catch (err) {
    console.error("Reject admin transaction error:", err);
    res.status(500).json({ success: false, message: "Failed to reject transaction" });
  }
};

exports.manageTransaction = async (req, res) => {
  try {
    const transactionId = req.params.id;
    const approvedAmount = Number(req.body.amount || 0);

    if (!transactionId) {
      return res.status(400).json({ success: false, message: "Transaction id is required" });
    }

    const transaction =
      (await Transaction.findById(transactionId)) ||
      (await Transaction.findOne({ transactionId }));

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status === "success") {
      return res.status(400).json({ success: false, message: "Transaction is already approved" });
    }

    const user = await User.findById(transaction.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Associated user not found" });
    }

    const amountToCredit = approvedAmount || Number(transaction.amount || 0);
    if (!amountToCredit || amountToCredit <= 0) {
      return res.status(400).json({ success: false, message: "Valid approved amount is required" });
    }

    if (transaction.type === "deposit") {
      const currentDeposit = user.wallet.deposit || 0;
      user.wallet.deposit = currentDeposit + amountToCredit;
      transaction.balanceAfter = (transaction.balanceBefore || 0) + amountToCredit;
      await user.save();
    } else if (transaction.type === "withdraw") {
      if (amountToCredit !== Number(transaction.amount || 0)) {
        return res.status(400).json({ success: false, message: "Approved amount must match requested withdraw amount" });
      }
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore || 0) - amountToCredit;
    } else {
      return res.status(400).json({ success: false, message: "Unsupported transaction type for manageTransaction" });
    }

    transaction.status = "success";
    transaction.amount = amountToCredit;
    transaction.metadata = transaction.metadata || {};
    transaction.metadata.adminNote = `Approved by admin via manageTransaction on ${new Date().toISOString()}`;

    await transaction.save();

    res.json({
      success: true,
      message: transaction.type === 'withdraw'
        ? `Withdrawal approved for ₹${transaction.amount}`
        : "Transaction approved and wallet updated",
      transaction
    });
  } catch (err) {
    console.error("Manage transaction error:", err);
    res.status(500).json({ success: false, message: "Server error while approving transaction" });
  }
};

/**
 * ✅ APPROVE DEPOSIT TRANSACTION
 * Admin approves pending deposit and credits user wallet
 */
exports.approveTransaction = async (req, res) => {
  try {
    const { depositId, transactionId } = req.params;
    const { actualAmount } = req.body;
    const lookupId = depositId || transactionId;
    const amountToCredit = Number(actualAmount);

    if (!lookupId) {
      return res.status(400).json({ success: false, message: "Deposit ID or transaction reference is required" });
    }

    if (!amountToCredit || amountToCredit <= 0) {
      return res.status(400).json({ success: false, message: "Valid actual amount is required" });
    }

    let deposit = await Deposit.findById(lookupId);
    if (!deposit) {
      deposit = await Deposit.findOne({ transactionId: lookupId });
    }

    if (deposit && deposit.status === 'pending') {
      const user = await User.findById(deposit.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      await User.findByIdAndUpdate(deposit.userId, {
        $inc: { "wallet.deposit": amountToCredit }
      });

      deposit.status = 'approved';
      deposit.amount = amountToCredit;
      await deposit.save();

      const pendingTransaction = await Transaction.findOne({
        userId: deposit.userId,
        paymentId: deposit.transactionId,
        type: 'deposit',
        status: 'pending'
      });

      if (pendingTransaction) {
        pendingTransaction.status = 'success';
        pendingTransaction.amount = amountToCredit;
        pendingTransaction.balanceAfter = pendingTransaction.balanceBefore + amountToCredit;
        pendingTransaction.metadata = pendingTransaction.metadata || {};
        pendingTransaction.metadata.adminNote = `Approved by admin on ${new Date().toISOString()}`;
        await pendingTransaction.save();
      }

      return res.json({ success: true, message: "Deposit Approved with Correct Amount!" });
    }

    const transaction = await Transaction.findOne({ transactionId: lookupId });
    if (!transaction || transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    if (transaction.type === 'withdraw') {
      transaction.status = 'success';
      transaction.balanceAfter = transaction.balanceAfter || (transaction.balanceBefore - transaction.amount);
      transaction.metadata = transaction.metadata || {};
      transaction.metadata.adminNote = `Withdrawal approved by admin on ${new Date().toISOString()}`;
      await transaction.save();
      return res.json({ success: true, message: "Withdrawal approved successfully!" });
    }

    if (transaction.type === 'deposit') {
      const user = await User.findById(transaction.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      await User.findByIdAndUpdate(transaction.userId, {
        $inc: { "wallet.deposit": amountToCredit }
      });

      transaction.status = 'success';
      transaction.amount = amountToCredit;
      transaction.balanceAfter = transaction.balanceBefore + amountToCredit;
      transaction.metadata = transaction.metadata || {};
      transaction.metadata.adminNote = `Deposit approved by admin on ${new Date().toISOString()}`;
      await transaction.save();

      return res.json({ success: true, message: "Deposit approved successfully!" });
    }

    return res.status(400).json({ success: false, message: "Unsupported transaction type for approval" });
  } catch (err) {
    console.error("Approve transaction error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * ❌ REJECT DEPOSIT TRANSACTION
 * Admin rejects deposit request
 */
exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    const user = await User.findById(transaction.userId);
    if (transaction.type === 'withdraw' && user) {
      user.wallet.winnings = (user.wallet.winnings || 0) + transaction.amount;
      await user.save();
      transaction.balanceAfter = transaction.balanceBefore;
    }

    // Update transaction status
    transaction.status = 'failed';
    transaction.failureReason = reason || 'Rejected by admin';
    transaction.metadata = transaction.metadata || {};
    transaction.metadata.adminNote = `Rejected: ${reason}`;

    await transaction.save();

    res.json({
      success: true,
      message: transaction.type === 'withdraw' ? "Withdrawal request rejected" : "Deposit request rejected",
      transaction: transaction
    });

  } catch (err) {
    console.error("Reject transaction error:", err);
    res.status(500).json({ success: false, message: "Failed to reject transaction" });
  }
};