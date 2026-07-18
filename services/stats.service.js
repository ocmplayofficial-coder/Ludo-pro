import { TransactionModel } from "../models/transaction.model.js";
import { db } from "../config/db.js";
class StatsService {

  static async getOnlinePlayers() {
    try {
      const activePlayers = new Set();

      const addPlayer = (userId) => {
        if (!userId) return;
        activePlayers.add(String(userId));
      };

      if (db.ludoGames instanceof Map) {
        for (const game of db.ludoGames.values()) {
          if (!game || !game.players) continue;
          const isActive = ['PLAYING', 'PLAYING_PENDING', 'MATCHMAKING'].includes(game.status);
          if (!isActive) continue;
          addPlayer(game.players?.red?.userId);
          addPlayer(game.players?.yellow?.userId);
        }
      }

      if (db.teenPattiGames instanceof Map) {
        for (const game of db.teenPattiGames.values()) {
          if (!game || !game.players) continue;
          const isActive = ['PLAYING', 'PLAYING_PENDING', 'MATCHMAKING'].includes(game.status);
          if (!isActive) continue;
          addPlayer(game.players?.A?.userId);
          addPlayer(game.players?.B?.userId);
        }
      }

      const queueMaps = [global.__matchmakingQueue, global.__tpQueue];
      for (const queueMap of queueMaps) {
        if (!(queueMap instanceof Map)) continue;
        for (const queue of queueMap.values()) {
          if (!Array.isArray(queue)) continue;
          for (const entry of queue) {
            addPlayer(entry?.user?._id || entry?.user?.id);
          }
        }
      }

      return activePlayers.size;
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
