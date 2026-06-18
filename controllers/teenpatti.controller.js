import { TeenPattiService } from '../services/teenpatti.service.js';

export class TeenPattiController {
  static matchmaking(req, res) {
    const { variant, minBet } = req.body;
    try {
      const game = TeenPattiService.matchmaking(req.user, variant, minBet);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static getGame(req, res) {
    try {
      const game = TeenPattiService.getGame(req.params.id);
      return res.json(game);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  }

  static fold(req, res) {
    try {
      const game = TeenPattiService.fold(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static seen(req, res) {
    try {
      const game = TeenPattiService.seen(req.params.id);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static chaal(req, res) {
    try {
      const game = TeenPattiService.chaal(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static show(req, res) {
    try {
      const game = TeenPattiService.show(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}
