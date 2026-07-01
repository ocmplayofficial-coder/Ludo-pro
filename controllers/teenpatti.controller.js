import { TeenPattiService } from '../services/teenpatti.service.js';
import { db } from '../config/db.js';
import { TeenPattiMatchModel } from '../models/teenpattiMatch.model.js';
import { ArenaModel } from '../models/arena.model.js';

export class TeenPattiController {
  
  static async getArenas(req, res) {
    try {
      let tpArenas = await ArenaModel.find({ gameType: 'teenpatti' }).lean();
      
      // Auto seed default arenas if none exist in DB
      if (tpArenas.length === 0) {
        const defaults = [
          // Classic
          { id: "tp-c-10", gameType: "teenpatti", mode: "CLASSIC", entryFee: 10, winningPrize: 18, active: true },
          { id: "tp-c-50", gameType: "teenpatti", mode: "CLASSIC", entryFee: 50, winningPrize: 90, active: true },
          { id: "tp-c-100", gameType: "teenpatti", mode: "CLASSIC", entryFee: 100, winningPrize: 180, active: true },
          { id: "tp-c-500", gameType: "teenpatti", mode: "CLASSIC", entryFee: 500, winningPrize: 900, active: true },
          { id: "tp-c-1000", gameType: "teenpatti", mode: "CLASSIC", entryFee: 1000, winningPrize: 1800, active: true },
          { id: "tp-c-5000", gameType: "teenpatti", mode: "CLASSIC", entryFee: 5000, winningPrize: 9000, active: true },
          { id: "tp-c-10000", gameType: "teenpatti", mode: "CLASSIC", entryFee: 10000, winningPrize: 18000, active: true },
          { id: "tp-c-50000", gameType: "teenpatti", mode: "CLASSIC", entryFee: 50000, winningPrize: 90000, active: true },
          { id: "tp-c-100000", gameType: "teenpatti", mode: "CLASSIC", entryFee: 100000, winningPrize: 180000, active: true },
          // Muflis
          { id: "tp-m-10", gameType: "teenpatti", mode: "MUFLIS", entryFee: 10, winningPrize: 18, active: true },
          { id: "tp-m-50", gameType: "teenpatti", mode: "MUFLIS", entryFee: 50, winningPrize: 90, active: true },
          { id: "tp-m-100", gameType: "teenpatti", mode: "MUFLIS", entryFee: 100, winningPrize: 180, active: true },
          { id: "tp-m-500", gameType: "teenpatti", mode: "MUFLIS", entryFee: 500, winningPrize: 900, active: true },
          { id: "tp-m-1000", gameType: "teenpatti", mode: "MUFLIS", entryFee: 1000, winningPrize: 1800, active: true },
          { id: "tp-m-5000", gameType: "teenpatti", mode: "MUFLIS", entryFee: 5000, winningPrize: 9000, active: true },
          { id: "tp-m-10000", gameType: "teenpatti", mode: "MUFLIS", entryFee: 10000, winningPrize: 18000, active: true },
          // Joker
          { id: "tp-j-50", gameType: "teenpatti", mode: "JOKER", entryFee: 50, winningPrize: 90, active: true },
          { id: "tp-j-100", gameType: "teenpatti", mode: "JOKER", entryFee: 100, winningPrize: 180, active: true },
          { id: "tp-j-500", gameType: "teenpatti", mode: "JOKER", entryFee: 500, winningPrize: 900, active: true },
          { id: "tp-j-1000", gameType: "teenpatti", mode: "JOKER", entryFee: 1000, winningPrize: 1800, active: true },
          { id: "tp-j-5000", gameType: "teenpatti", mode: "JOKER", entryFee: 5000, winningPrize: 9000, active: true },
          { id: "tp-j-10000", gameType: "teenpatti", mode: "JOKER", entryFee: 10000, winningPrize: 18000, active: true }
        ];

        const inserted = await ArenaModel.insertMany(defaults);
        inserted.forEach(d => {
          db.gameArenas.push(d.toObject());
        });

        tpArenas = await ArenaModel.find({ gameType: 'teenpatti' }).lean();
      }

      // Attach real-time waiting players count
      tpArenas = tpArenas.map(arena => {
        const queueKey = `${arena.entryFee}:${arena.mode?.toUpperCase()}`;
        const q = global.__tpQueue?.get(queueKey);
        return { ...arena, waitingPlayers: q ? q.length : 0 };
      });

      return res.json({ success: true, arenas: tpArenas });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static getTables(req, res) {
    try {
      const activeGames = [...db.teenPattiGames.values()].filter(g => g.status === 'PLAYING');
      return res.json({ success: true, tables: activeGames });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async matchmaking(req, res) {
    const { variant, minBet } = req.body;
    try {
      const game = await TeenPattiService.matchmaking(req.user, variant, minBet);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static getGame(req, res) {
    try {
      const game = TeenPattiService.getGame(req.params.id);
      return res.json(game);
    } catch (err) {
      return res.status(404).json({ success: false, error: err.message });
    }
  }

  static async leave(req, res) {
    try {
      const game = await TeenPattiService.leave(req.body.matchId || req.params.id, req.user);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static async fold(req, res) {
    try {
      const game = await TeenPattiService.fold(req.body.matchId || req.params.id, req.user);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static seen(req, res) {
    try {
      const game = TeenPattiService.seen(req.body.matchId || req.params.id, req.user);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static async chaal(req, res) {
    try {
      const game = await TeenPattiService.chaal(req.body.matchId || req.params.id, req.user);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static async show(req, res) {
    try {
      const game = await TeenPattiService.show(req.body.matchId || req.params.id, req.user);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static async getMatchHistory(req, res) {
    try {
      const userId = req.user._id;
      const history = await TeenPattiMatchModel.find({
        "players.userId": userId
      }).sort({ createdAt: -1 }).lean();
      
      return res.json({ success: true, history });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async cancelMatchmaking(req, res) {
    try {
      const result = await TeenPattiService.cancelMatchmaking(req.user);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}
