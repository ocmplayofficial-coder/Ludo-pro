import { UserService } from '../services/user.service.js';

export class UserController {
  static async getProfile(req, res) {
    try {
      const profile = UserService.getProfile(req.user);

      // Keep it strictly reading from db state!
      const dbWinnings = profile.winningsBalance ?? 0;
      const dbDeposit = profile.depositBalance ?? 0;
      
      profile.winningsBalance = dbWinnings;
      profile.walletBalance = dbDeposit + dbWinnings;

      return res.json(profile);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateProfile(req, res) {
    const { username, avatar, preferredColor } = req.body;
    try {
      const updatedUser = await UserService.updateProfile(req.user, username, avatar, preferredColor);
      return res.json({ success: true, user: updatedUser });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async getLeaderboard(req, res) {
    try {
      const { UserModel } = await import('../models/user.model.js');
      const users = await UserModel.find({ status: 'active', earnings: { $gte: 1000 } })
        .sort({ earnings: -1, wins: -1 })
        .limit(20)
        .select('_id username avatar earnings wins gamesPlayed');
      
      const leaderboard = users.map(u => ({
        id: u._id.toString(),
        username: u.username,
        avatar: u.avatar,
        earnings: u.earnings || 0,
        wins: u.wins || 0,
        gamesPlayed: u.gamesPlayed || 0
      }));

      return res.json({ success: true, leaderboard });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static getSupportMessages(req, res) {
    try {
      const messages = UserService.getSupportMessages();
      return res.json(messages);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static addSupportMessage(req, res) {
    const { text } = req.body;
    try {
      const messages = UserService.addSupportMessage(req.user, text);
      return res.json({ success: true, messages });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static async getMatchHistory(req, res) {
    try {
      const { TeenPattiMatchModel } = await import('../models/teenpattiMatch.model.js');
      const { LudoMatchModel } = await import('../models/ludoMatch.model.js');
      const userId = req.user._id.toString();

      const tpHistoryDB = await TeenPattiMatchModel.find({
        $or: [
          { "players.A.userId": userId },
          { "players.B.userId": userId }
        ]
      }).lean();

      const ludoHistoryDB = await LudoMatchModel.find({
        $or: [
          { "players.red.userId": userId },
          { "players.yellow.userId": userId }
        ]
      }).lean();

      const combinedHistory = [];

      for (const match of tpHistoryDB) {
        const isWinner = match.winnerId && match.winnerId.toString() === userId;
        const isDraw = !match.winnerId && match.status === 'FINISHED';
        let result = isWinner ? 'WIN' : 'LOSS';
        if (isDraw) result = 'DRAW';
        combinedHistory.push({
          id: match._id.toString(),
          gameType: 'TEEN PATTI',
          variant: match.variant,
          createdAt: match.createdAt,
          entryFee: match.entryFee,
          prizeAmount: isWinner ? match.pot : 0,
          result: result
        });
      }

      for (const match of ludoHistoryDB) {
        const isWinner = match.winnerId && match.winnerId.toString() === userId;
        const isDraw = !match.winnerId && match.status === 'FINISHED';
        let result = isWinner ? 'WIN' : 'LOSS';
        if (isDraw) result = 'DRAW';
        combinedHistory.push({
          id: match._id.toString(),
          gameType: 'LUDO',
          variant: match.variant,
          createdAt: match.createdAt,
          entryFee: match.entryFee,
          prizeAmount: isWinner ? match.winningPrize : 0,
          result: result
        });
      }

      // Sort by descending createdAt date
      combinedHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ success: true, history: combinedHistory });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getMyReferrals(req, res) {
    try {
      const { UserModel } = await import('../models/user.model.js');
      const userId = req.user._id.toString();

      // Find all users who were referred by the current user
      const referrals = await UserModel.find({ referredBy: userId })
        .select('_id username avatar createdAt')
        .sort({ createdAt: -1 })
        .lean();

      // Get the current user's total earnings
      const user = await UserModel.findById(userId).select('referralEarnings referralCount').lean();

      return res.json({
        success: true,
        totalEarnings: user?.referralEarnings || 0,
        referralCount: user?.referralCount || 0,
        referrals: referrals.map(r => ({
          id: r._id.toString(),
          username: r.username,
          avatar: r.avatar,
          joinedAt: r.createdAt
        }))
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}
