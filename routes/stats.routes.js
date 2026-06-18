// stats.routes.js - provides dashboard statistics
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/stats
router.get('/', authMiddleware, (req, res) => {
  try {
    // global.onlinePlayers is a Set of user IDs
    const onlinePlayers = global.onlinePlayers ? global.onlinePlayers.size : 0;
    // Use activeGames map if present, otherwise fall back to db.ludoGames count
    const liveGames = global.activeGames ? global.activeGames.size : (global.db?.ludoGames?.size || 0);
    res.json({ onlinePlayers, liveGames });
  } catch (err) {
    console.error('Stats endpoint error', err);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

export default router;
