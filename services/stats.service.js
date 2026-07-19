import { TransactionModel } from "../models/transaction.model.js";
import { db } from "../config/db.js";
class StatsService {

  static async getOnlinePlayers() {
    try {
      if (global.onlineUsers instanceof Map) {
        return global.onlineUsers.size;
      }
      return 0;
    } catch (err) {
      console.error("ONLINE_PLAYERS_ERROR", err);
      return 0;
    }
  }

  static async getLiveGames() {
    try {
      if (db.ludoGames instanceof Map) {
        return db.ludoGames.size;
      }
      return 0;
    } catch (err) {
      console.error("LIVE_GAMES_ERROR", err);
      return 0;
    }
  }
  static async getLiveTeenPattiGames() {
    try {
      if (db.teenPattiGames instanceof Map) {
        return db.teenPattiGames.size;
      }
      return 0;
    } catch (err) {
      console.error("LIVE_TEEN_PATTI_ERROR", err);
      return 0;
    }
  }

  static async getTotalProfit() {
    try {
      // Sum of successful deposit transactions minus successful withdraw transactions
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
      return totalDeposits - totalWithdrawals;
    } catch (err) {
      console.error("TOTAL_PROFIT_ERROR", err);
      return 0;
    }
  }

  static async emitStatsUpdate(io) {
    try {
      const stats = {
        onlinePlayers: await this.getOnlinePlayers(),
        liveLudo: await this.getLiveGames(),
        liveTP: await this.getLiveTeenPattiGames(),
        totalProfit: await this.getTotalProfit()
      };

      io.emit("statsUpdate", stats);

    } catch (err) {
      console.error("STATS_UPDATE_ERROR", err);
    }
  }
}

export { StatsService };