import { StatsService } from '../services/stats.service.js';

export const getLiveStats = async (req, res) => {
  try {
    const onlinePlayers = await StatsService.getOnlinePlayers();
    const liveGames = await StatsService.getLiveGames();
    res.json({ onlinePlayers, liveGames });
  } catch (err) {
    console.error('STATS_CONTROLLER_ERROR', err);
    res.status(500).json({ onlinePlayers: 0, liveGames: 0 });
  }
};
