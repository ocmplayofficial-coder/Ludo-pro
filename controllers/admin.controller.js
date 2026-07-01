import { AdminService } from "../services/admin.service.js";
import { signToken } from "../config/jwt.js";
import { env } from "../config/env.js";
import { StatsService } from "../services/stats.service.js";
import { db } from "../config/db.js";
import { UserModel } from "../models/user.model.js";
import { PaymentMethodModel } from "../models/paymentMethod.model.js";
import { DepositRequestModel } from "../models/depositRequest.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { TeenPattiMatchModel } from "../models/teenpattiMatch.model.js";
import { ArenaModel } from "../models/arena.model.js";
export class AdminController {
  static async getAllUsers(req, res) {
    console.log("🔥 GET_ALL_USERS CALLED");

    try {
      const rawUsers = await UserModel.find().lean();

      const users = rawUsers.map(user => ({
        _id: user._id,

        name: user.username,

        phone: user.phoneNumber,

        wallet: {
          deposit: user.depositBalance || 0,
          winnings: user.winningsBalance || 0
        },

        status: user.status || "active"
      }));

      return res.json({
        success: true,
        users
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  static async updateWallet(req, res) {
    console.log("🔥 UPDATE_WALLET CALLED");
    try {
      const { userId, amount, type } = req.body;

      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      if (type === "deposit") {
        user.depositBalance += Number(amount);
      }

      if (type === "winning") {
        user.winningsBalance += Number(amount);
      }

      user.walletBalance =
        user.depositBalance +
        user.winningsBalance;

      await user.save();

      return res.json({
        success: true,
        user
      });

    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  static async banUser(req, res) {
    try {
      const { userId, status } = req.body;

      const user = await UserModel.findByIdAndUpdate(
        userId,
        { status },
        { new: true }
      );

      return res.json({
        success: true,
        user
      });

    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }
  // ======================
  // PAYMENT METHODS
  // ======================

  static async getPaymentMethods(req, res) {
    try {

      const paymentMethods =
        await PaymentMethodModel.find()
          .sort({ createdAt: -1 });

      console.log('PAYMENT METHOD FETCHED', paymentMethods.length);

      return res.json({
        success: true,
        paymentMethods
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        message: err.message
      });

    }
  }

  static async addPaymentMethod(req, res) {
    try {

      const { type, upiId } = req.body;


      console.log('UPLOAD REQ FILE =', req.file);
      console.log('UPLOAD REQ FILES =', req.files);
      console.log('UPLOAD REQ BODY =', req.body);

      // Support both req.file (single) and req.files (fields)
      let qrFilename = "";
      if (req.file && req.file.filename) qrFilename = req.file.filename;
      else if (req.files) {
        const files = req.files;
        const firstFile = (files.qrCode && files.qrCode[0]) || (files.qrImage && files.qrImage[0]) || (files.file && files.file[0]) || (files.image && files.image[0]);
        qrFilename = firstFile?.filename || "";
      }
      const paymentMethod = await PaymentMethodModel.create({
        type,
        upiId: upiId || "",
        qrCode: qrFilename,
        active: true
      });

      console.log('PAYMENT METHOD SAVED', paymentMethod._id);

      return res.json({
        success: true,
        upiId: paymentMethod.upiId,
        qrCode: paymentMethod.qrCode ? `/uploads/${paymentMethod.qrCode}` : ""
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        message: err.message
      });

    }
  }

  static async removePaymentMethod(req, res) {
    try {

      await PaymentMethodModel.findByIdAndDelete(
        req.params.id
      );

      return res.json({
        success: true
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        message: err.message
      });

    }
  }
  // ======================
  // CREATE GAME ARENA
  // ======================
  static async createGame(req, res) {
    try {

      const {
        gameType,
        mode,
        entryFee,
        winningPrize
      } = req.body;

      if (
        !gameType ||
        !mode ||
        !entryFee ||
        !winningPrize
      ) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields"
        });
      }

      const arena = {
        id: Date.now().toString(),
        gameType,
        mode,
        entryFee: Number(entryFee),
        winningPrize: Number(winningPrize),
        active: true,
        createdAt: new Date()
      };

      // Save to MongoDB
      const newArena = await ArenaModel.create(arena);

      // Keep in-memory cache synced
      db.gameArenas.push(newArena.toObject());

      console.log(
        "NEW_ARENA_CREATED =",
        newArena
      );

      return res.json({
        success: true,
        arena: newArena
      });

    } catch (err) {

      console.error(
        "CREATE_GAME_ERROR",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  // ======================
  // GET ALL ARENAS
  // ======================
  static async getArenas(req, res) {
    try {
      // Always fetch fresh from DB for frontend
      let arenas = await ArenaModel.find().lean();
      
      // Attach real-time waiting players count
      arenas = arenas.map(arena => {
        let count = 0;
        if (arena.gameType === 'ludo') {
          const queueKey = `${arena.entryFee}:${arena.mode?.toUpperCase()}`;
          const q = global.__matchmakingQueue?.get(queueKey);
          count = q ? q.length : 0;
        } else if (arena.gameType === 'teenpatti') {
          const queueKey = `${arena.entryFee}:${arena.mode?.toUpperCase()}`;
          const q = global.__tpQueue?.get(queueKey);
          count = q ? q.length : 0;
        }
        return { ...arena, waitingPlayers: count };
      });
      
      return res.json({
        success: true,
        arenas
      });

    } catch (err) {

      console.error(
        "GET_ARENAS_ERROR",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
  // ======================
  // LIVE MATCHES
  // ======================
  // ====================== 
  // GAME STATS
  // ======================
  static async getGameStats(req, res) {
    try {

      const ludoGames = [...db.ludoGames.values()];

      const totalGames = ludoGames.length;

      const activeTables = ludoGames.filter(game =>
        ["MATCHMAKING", "PLAYING", "PLAYING_PENDING"]
          .includes(game.status)
      ).length;

      // Platform fee ₹30 per finished game
      const revenue = ludoGames
        .filter(game => game.status === "FINISHED")
        .reduce((sum) => sum + 30, 0);

      const systemAlerts = 0;

      console.log("GAME_STATS =", {
        totalGames,
        activeTables,
        revenue,
        systemAlerts
      });

      return res.json({
        success: true,
        data: {
          totalGames,
          activeTables,
          revenue,
          systemAlerts
        }
      });

    } catch (err) {

      console.error(
        "ADMIN_GAME_STATS_ERROR",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
  // ======================
  // LIVE MATCHES
  // ======================
  static async getLiveMatches(req, res) {
    try {

      console.log(
        "LIVE_MATCHES_COUNT =",
        db.ludoGames.size
      );

      const matches = [...db.ludoGames.values()]
        .filter(game =>
          ["MATCHMAKING", "PLAYING", "PLAYING_PENDING"]
            .includes(game.status)
        )
        .map(game => ({
          matchId: game.matchId,
          entryFee: game.entryFee,
          status: game.status,
          createdAt: game.createdAt,

          players: [
            game.players?.red?.username || "Waiting",
            game.players?.yellow?.username || "Waiting"
          ]
        }));

      return res.json({
        success: true,
        matches
      });

    } catch (err) {

      console.error(
        "ADMIN_LIVE_MATCHES_ERROR",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
  // ======================
  // ADMIN LOGIN
  // ======================
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      if (
        email !== env.ADMIN_EMAIL ||
        password !== env.ADMIN_PASSWORD
      ) {
        return res.status(401).json({
          success: false,
          error: "Invalid admin credentials"
        });
      }

      const token = signToken({
        id: "admin",
        role: "admin",
        email
      });

      return res.json({
        success: true,
        token,
        user: {
          id: "admin",
          role: "admin",
          email
        }
      });

    } catch (err) {
      console.error("ADMIN_LOGIN_ERROR", err);

      return res.status(500).json({
        success: false,
        error: "Login failed"
      });
    }

  }

  // ======================
  // DASHBOARD STATS
  // ======================
  static async getDashboardStats(req, res) {
    try {
      const onlinePlayers =
        await StatsService.getOnlinePlayers();

      const liveLudo =
        await StatsService.getLiveGames();

      console.log(
        "CONTROLLER_LIVE_LUDO =",
        liveLudo
      );

      const liveTP =
        await StatsService.getLiveTeenPattiGames();

      const totalProfit =
        await StatsService.getTotalProfit();

      return res.json({
        success: true,
        data: {
          onlinePlayers,
          liveLudo,
          liveTP,
          totalProfit,
          recentMatches: []
        }
      });

    } catch (err) {
      console.error(
        "ADMIN_DASHBOARD_STATS_ERROR",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

  }

  // ======================
  // GAMES
  // ======================
  static async getGames(req, res) {
    try {

      console.log(
        "ADMIN_GAMES_LUDO =",
        db.ludoGames.size
      );

      console.log(
        "ADMIN_GAMES_TP =",
        db.teenPattiGames.size
      );

      for (const game of db.ludoGames.values()) {
        console.log(
          "LUDO_GAME",
          game.matchId,
          game.status
        );
      }

      const ludoGames = [...db.ludoGames.values()].map(game => ({
        id: game.matchId,
        type: "Ludo",

        players:
          Object.values(game.players || {})
            .filter(Boolean)
            .length,

        winner: game.winner || "-",

        prize: game.winningPrize || 0,

        mode: game.variant || "Classic",

        status: game.status,

        createdAt: game.createdAt
      }));

      const teenPattiGames =
        [...db.teenPattiGames.values()].map(game => ({
          id: game.matchId,
          type: "Teen Patti",

          players: game.players?.length || 0,

          winner: game.winner || "-",

          prize: game.winningPrize || 0,

          mode: game.variant || "Classic",

          status: game.status,

          createdAt: game.createdAt
        }));

      return res.json({
        success: true,
        games: [
          ...ludoGames,
          ...teenPattiGames
        ]
      });

    } catch (err) {
      console.error(
        "ADMIN_GAMES_ERROR",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

  }

  // ======================
  // TRANSACTION ACTION
  // ======================
  static async handleTransactionAction(
    req,
    res
  ) {
    try {
      const { id } = req.params;
      const { action } = req.body;

      const tx =
        AdminService.handleTransactionAction(
          req.user,
          id,
          action
        );

      return res.json({
        success: true,
        transaction: tx,
        user: req.user
      });

    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

  }

  // ======================
  // FINANCIAL STATS
  // ======================
  static async getFinancialStats(req, res) {
    try {
      const depositResult = await TransactionModel.aggregate([
        { $match: { type: "DEPOSIT", status: "SUCCESS" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);
      const withdrawResult = await TransactionModel.aggregate([
        { $match: { type: "WITHDRAW", status: "SUCCESS" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);
      const totalDeposits = depositResult[0]?.total || 0;
      const totalWithdrawals = withdrawResult[0]?.total || 0;
      const platformRevenue = totalDeposits - totalWithdrawals;

      return res.json({
        success: true,
        totalDeposits,
        totalWithdrawals,
        platformRevenue
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ======================
  // TRANSACTIONS LIST
  // ======================
  // static async getTransactions(req, res) {
  //   try {
  //     const transactions = await TransactionModel.find()
  //       .populate("user", "username phoneNumber")
  //       .populate("paymentMethod", "upiId qrCode type")
  //       .sort({ createdAt: -1 });

  //     console.log(
  //       "FIRST_TRANSACTION",
  //       JSON.stringify(transactions[0], null, 2)
  //     );

  //     return res.json({
  //       success: true,
  //       transactions
  //     });

  //   } catch (err) {
  //     return res.status(500).json({
  //       success: false,
  //       message: err.message
  //     });
  //   }
  // }
  static async getTransactions(req, res) {

    try {
      const transactions = await TransactionModel.find()
        .populate("user", "username phoneNumber")
        .populate("paymentMethod", "upiId qrCode type")
        .sort({ createdAt: -1 });
      return res.json({ success: true, transactions });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ======================
  // APPROVE TRANSACTION
  // ======================
  static async approveTransaction(req, res) {
    try {
      const { id } = req.params;
      const transaction = await TransactionModel.findById(id);
      if (!transaction) {
        return res.status(404).json({ success: false, message: "Transaction not found" });
      }
      if (transaction.status !== "PENDING") {
        return res.status(400).json({ success: false, message: "Transaction already processed" });
      }
      transaction.status = "APPROVED";
      await transaction.save();

      // credit/debit user based on type
      const user = await UserModel.findById(transaction.user);
      if (user) {
        if (transaction.type === "DEPOSIT") {
          user.depositBalance += transaction.amount;
        } else if (transaction.type === "WITHDRAW") {
          user.depositBalance = Math.max(0, user.depositBalance - transaction.amount);
        }
        user.walletBalance = user.depositBalance + (user.winningsBalance || 0);
        await user.save();
      }

      return res.json({ success: true, transaction });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ======================
  // REJECT TRANSACTION
  // ======================
  static async rejectTransaction(req, res) {
    try {
      const { id } = req.params;
      const transaction = await TransactionModel.findById(id);
      if (!transaction) {
        return res.status(404).json({ success: false, message: "Transaction not found" });
      }
      if (transaction.status !== "PENDING") {
        return res.status(400).json({ success: false, message: "Transaction already processed" });
      }
      transaction.status = "REJECTED";
      await transaction.save();
      return res.json({ success: true, transaction });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ======================
  // DEPOSIT REQUESTS
  // ======================

  static async getDepositRequests(req, res) {
    try {
      const depositRequests = await DepositRequestModel.find()
        .populate("user", "username phoneNumber")
        .populate("paymentMethod", "upiId qrCode type")
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        depositRequests
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  static async handleDepositRequestAction(req, res) {
    try {
      const { id } = req.params;
      const { action } = req.body; // "APPROVE" or "REJECT"

      const depositRequest = await DepositRequestModel.findById(id);
      if (!depositRequest) {
        return res.status(404).json({
          success: false,
          message: "Deposit request not found"
        });
      }

      if (depositRequest.status !== "PENDING") {
        return res.status(400).json({
          success: false,
          message: "Deposit request already processed"
        });
      }

      if (action === "APPROVE") {
        depositRequest.status = "APPROVED";
        await depositRequest.save();

        const user = await UserModel.findById(depositRequest.user);
        if (user) {
          const amount = depositRequest.amount;
          user.depositBalance += amount;
          user.walletBalance = user.depositBalance + user.winningsBalance;

          const notifId = "NOTIF" + Date.now() + Math.floor(Math.random() * 1000);
          user.notifications.push({
            id: notifId,
            message: `Your deposit request of ₹${amount} has been APPROVED.`,
            read: false,
            createdAt: new Date()
          });

          await user.save();

          // const { addTransaction } = await import("../wallet/transaction.service.js");
          let method = "UPI Gateway";
          try {
            const pm = await PaymentMethodModel.findById(depositRequest.paymentMethod);
            if (pm && pm.upiId) {
              method = `UPI (${pm.upiId})`;
            }
          } catch (e) {
            // ignore
          }

          await TransactionModel.create({
            user: user._id,
            paymentMethod: depositRequest.paymentMethod,
            type: "DEPOSIT",
            amount: amount,
            status: "SUCCESS",
            method: method
          });
        }
      } else if (action === "REJECT") {
        depositRequest.status = "REJECTED";
        await depositRequest.save();

        const user = await UserModel.findById(depositRequest.user);
        if (user) {
          const notifId = "NOTIF" + Date.now() + Math.floor(Math.random() * 1000);
          user.notifications.push({
            id: notifId,
            message: `Your deposit request of ₹${depositRequest.amount} has been REJECTED.`,
            read: false,
            createdAt: new Date()
          });
          await user.save();
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Use APPROVE or REJECT"
        });
      }

      return res.json({
        success: true,
        depositRequest
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  // ============================
  // TEEN PATTI ADMIN METHODS
  // ============================
  static async createTPArena(req, res) {
    try {
      const { mode, entryFee, winningPrize } = req.body;
      if (!mode || !entryFee || !winningPrize) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }
      const arena = {
        id: "tp-" + Date.now().toString(),
        gameType: "teenpatti",
        mode: mode.toUpperCase(),
        entryFee: Number(entryFee),
        winningPrize: Number(winningPrize),
        active: true,
        createdAt: new Date()
      };
      
      const newArena = await ArenaModel.create(arena);
      db.gameArenas.push(newArena.toObject());
      
      return res.json({ success: true, arena: newArena });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async editTPArena(req, res) {
    try {
      const { id } = req.params;
      const { mode, entryFee, winningPrize, active } = req.body;
      
      const updateData = {};
      if (mode) updateData.mode = mode.toUpperCase();
      if (entryFee !== undefined) updateData.entryFee = Number(entryFee);
      if (winningPrize !== undefined) updateData.winningPrize = Number(winningPrize);
      if (active !== undefined) updateData.active = !!active;

      const updatedArena = await ArenaModel.findOneAndUpdate({ id }, updateData, { new: true }).lean();
      
      if (!updatedArena) {
        return res.status(404).json({ success: false, error: "Arena not found" });
      }

      // Sync in-memory DB
      const idx = db.gameArenas.findIndex(a => a.id === id);
      if (idx !== -1) {
        db.gameArenas[idx] = updatedArena;
      }

      return res.json({ success: true, arena: updatedArena });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async deleteTPArena(req, res) {
    try {
      const { id } = req.params;
      const deleted = await ArenaModel.findOneAndDelete({ id });
      
      if (!deleted) {
        return res.status(404).json({ success: false, error: "Arena not found" });
      }
      
      // Sync in-memory DB
      const idx = db.gameArenas.findIndex(a => a.id === id);
      if (idx !== -1) {
        db.gameArenas.splice(idx, 1);
      }
      
      return res.json({ success: true, message: "Arena deleted" });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static getTPLiveMatches(req, res) {
    try {
      const matches = [...db.teenPattiGames.values()].filter(g => g.status === 'PLAYING');
      return res.json({ success: true, matches });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getTPStats(req, res) {
    try {
      const onlinePlayers = global.onlinePlayers ? global.onlinePlayers.size : 0;
      const activeGamesList = [...db.teenPattiGames.values()].filter(g => g.status === 'PLAYING');
      const activeTablesCount = activeGamesList.length;

      const finished = await TeenPattiMatchModel.find().lean();

      const totalBets = finished.reduce((sum, m) => sum + m.pot, 0) + activeGamesList.reduce((sum, g) => sum + g.pot, 0);

      // Platform keeps 10% of entry fees
      const totalRevenue = finished.reduce((sum, m) => sum + (m.entryFee * 2 - m.winnings), 0) + (finished.length * 2); // default small markup

      return res.json({
        success: true,
        onlinePlayers,
        activeTables: activeTablesCount,
        totalBets,
        totalRevenue: Math.max(0, totalRevenue)
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getTPHistory(req, res) {
    try {
      const history = await TeenPattiMatchModel.find().sort({ createdAt: -1 }).lean();
      return res.json({ success: true, history });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}