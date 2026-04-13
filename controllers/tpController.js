const TPGame = require('../models/TPGame');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * 🃏 1. JOIN OR CREATE TEEN PATTI ROOM
 * Logic: Balance check -> Find Room -> Deduct Money -> Join
 */
exports.joinTPRoom = async (req, res) => {
  try {
    const { mode, bootAmount } = req.body;
    const userId = req.user?.id || req.user?._id;
    const entryAmount = Number(bootAmount);

    if (!mode || !bootAmount || isNaN(entryAmount) || entryAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid game mode or boot amount." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const deposit = Number(user.wallet.deposit || 0);
    const winnings = Number(user.wallet.winnings || 0);
    const bonus = Number(user.wallet.bonus || 0);
    const walletTotal = deposit + winnings + bonus;

    if (walletTotal < entryAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient Balance! Min ₹${entryAmount} required.` 
      });
    }

    let room = await TPGame.findOne({ 
      mode: mode.toUpperCase(), 
      bootAmount: entryAmount, 
      status: 'waiting',
      $expr: { $lt: [{ $size: "$players" }, 5] }
    });

    if (!room) {
      const roomId = "TP_" + Math.random().toString(36).substring(2, 9).toUpperCase();
      room = new TPGame({ 
        roomId, 
        mode: mode.toUpperCase(), 
        bootAmount: entryAmount, 
        players: [],
        potAmount: 0 
      });
    }

    const isAlreadyIn = room.players.some(p => p.userId.toString() === userId);
    if (isAlreadyIn) {
      return res.status(200).json({ 
        success: true, 
        roomId: room.roomId, 
        roomData: room, 
        message: 'Already joined this room.'
      });
    }

    const walletAtStart = walletTotal;
    await user.deductEntryFee(entryAmount);

    room.players.push({
      userId: user._id,
      name: user.name,
      avatar: user.avatar || '/assets/avatar-1.png',
      walletAtStart,
      lastBet: entryAmount,
      status: 'active'
    });

    room.potAmount += entryAmount;

    if (room.players.length >= 2 && room.status === 'waiting') {
      room.status = 'playing';
    }

    await room.save();

    res.status(200).json({ 
      success: true, 
      roomId: room.roomId,
      roomData: room 
    });

  } catch (error) {
    console.error("TP Join Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

/**
 * 📜 2. GET CURRENT GAME STATUS
 */
exports.getTPStatus = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await TPGame.findOne({ roomId })
      .populate("players.userId", "name avatar wallet");

    if (!room) {
      return res.status(404).json({ success: false, message: "Game room not found" });
    }

    res.status(200).json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 🏆 3. END GAME & DISTRIBUTE WINNINGS
 * Note: Ise backend engine se call kiya jata hai winner decide hone par
 */
exports.settleTPWinner = async (roomId, winnerUserId) => {
    try {
        const room = await TPGame.findOne({ roomId });
        if (!room || room.status === 'finished') return;

        const winner = await User.findById(winnerUserId);
        if (!winner) return;

        const totalCollected = room.potAmount || 0;
        const adminCommission = Math.floor(totalCollected * 0.05);
        const winningAmount = totalCollected - adminCommission;
        const balanceBefore = (winner.wallet.deposit || 0) + (winner.wallet.winnings || 0) + (winner.wallet.bonus || 0);

        winner.wallet.winnings = (winner.wallet.winnings || 0) + winningAmount;

        await winner.save();
        await Transaction.create({
            userId: winnerUserId,
            type: 'commission',
            amount: adminCommission,
            status: 'success',
            balanceBefore,
            balanceAfter: balanceBefore,
            walletSource: 'all',
            paymentMethod: 'internal',
            description: `Commission revenue from Teen Patti room ${roomId}`,
            tpGameId: room._id,
            metadata: { gameType: 'TEEN_PATTI' }
        });

        room.status = 'finished';
        room.winner = winnerUserId;
        room.winnerName = winner.name || '';
        room.platformFee = adminCommission;
        await room.save();

        return { success: true, winningAmount };
    } catch (error) {
        console.error("Winning distribution failed:", error);
    }
};