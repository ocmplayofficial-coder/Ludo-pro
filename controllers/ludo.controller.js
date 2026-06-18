import { LudoService } from '../services/ludo.service.js';

export class LudoController {
  static async matchmaking(req, res) {
    const { variant, entryFee } = req.body;
    try {
      console.log("MATCHMAKING USER", req.user._id);
      const game = await LudoService.matchmaking(req.user, variant, entryFee);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async matchmakingCancel(req, res) {
    try {
      const result = await LudoService.cancelMatchmaking(req.user);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static getGame(req, res) {
    try {
      const game = LudoService.getGame(req.params.id);
      if (!game) return res.status(404).json({ error: "Game not found." });
      return res.json(game);
    } catch (err) {
      const code = err.message.includes("not found") ? 404 : 500;
      return res.status(code).json({ error: err.message });
    }
  }

  static roll(req, res) {
    try {
      const game = LudoService.roll(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async move(req, res) {
    const { tokenId } = req.body;
    try {
      const game = await LudoService.move(req.params.id, req.user, tokenId);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }



  static async timeout(req, res) {
    try {
      const game = await LudoService.timeout(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async endTimeMode(req, res) {
    try {
      const game = await LudoService.endTimeMode(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static leave(req, res) {
    try {
      const game = LudoService.leave(req.params.id, req.user);
      return res.json(game);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}
