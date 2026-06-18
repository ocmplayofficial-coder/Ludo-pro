import { TransactionModel } from "../models/transaction.model.js";
import { db } from "../config/db.js";
class StatsService {

  static async getOnlinePlayers() {
    try {
      const namespaces = [
        global.lobbyNamespace,
        global.ludoNamespace,
        global.teenpattiNamespace,
        global.walletNamespace
      ];

      return namespaces.reduce((total, ns) => {
        return total + (ns?.sockets?.size || 0);
      }, 0);

    } catch (err) {
      console.error("ONLINE_PLAYERS_ERROR", err);
      return 0;
    }
  }

  static async getLiveGames() {
    try {

      console.log("======== LIVE GAME CHECK ========");

      console.log("db.ludoGames =", db.ludoGames);
      console.log("size =", db.ludoGames?.size);

      let count = 0;

      for (const game of db.ludoGames.values()) {

        console.log(
          "GAME:",
          game.matchId,
          game.status
        );

        if (
          ["MATCHMAKING", "PLAYING", "PLAYING_PENDING"]
            .includes(game.status)
        ) {
          count++;
        }
      }

      console.log("FINAL LIVE COUNT =", count);

      return count;

    } catch (err) {
      console.error(err);
      return 0;
    }
  }
  static async getLiveTeenPattiGames() {
    try {
      const games = db?.teenPattiGames;

      if (!games || !(games instanceof Map)) {
        return 0;
      }

      let count = 0;

      for (const game of games.values()) {
        if (
          game &&
          (
            game.status === "MATCHMAKING" ||
            game.status === "PLAYING"
          )
        ) {
          count++;
        }
      }

      return count;

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