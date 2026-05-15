const Game = require("../models/Game");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

/**
 * 🎰 MATCHMAKING (Join or Create)
 * Player jab "Play" dabata hai, toh hum pehle se khuli room dhoondte hain
 * warna nayi room banate hain (2-Player match ke liye).
 */
exports.joinMatchmaking = async (req, res) => {
  try {
    const { type, entryFee } = req.body; // e.g., 'classic', 50
    const userId = req.user.id;

    // 1. Check Wallet Balance
    const user = await User.findById(userId);
    if (user.wallet.balance < entryFee) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // 2. Find Waiting Room (Matchmaking)
    let game = await Game.findOne({
      type,
      entryFee,
      status: "waiting",
      "players.userId": { $ne: userId } // Khud ki room join na kare
    });

    if (game) {
      // 🤝 Match Found! Join the room
      game.players.push({
        userId: user._id,
        name: user.name,
        phone: user.phone,
        color: "red" // Second player usually red/blue
      });
      game.status = "playing";
      
      // Deduct Money
      user.wallet.balance -= entryFee;
      await user.save();
      await game.save();

      return res.json({ success: true, matchFound: true, roomId: game.roomId });
    } else {
      // 🆕 No match? Create new waiting room
      const roomId = Math.random().toString(36).substring(2, 9).toUpperCase();
      
      const newGame = new Game({
        roomId,
        type,
        entryFee,
        prizeMoney: entryFee * 1.8, // 10% Platform fee per player
        players: [{
          userId: user._id,
          name: user.name,
          phone: user.phone,
          color: "green"
        }],
        status: "waiting"
      });

      // Deduct Money
      user.wallet.balance -= entryFee;
      await user.save();
      await newGame.save();

      return res.json({ success: true, matchFound: false, roomId });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 🎲 ROLL DICE (Fair-Play Logic)
 * Backend par dice roll karna security ke liye zaroori hai.
 */
exports.rollDice = async (req, res) => {
  try {
    const { roomId } = req.body;
    const game = await Game.findOne({ roomId });

    if (!game) return res.status(404).json({ message: "Game not found" });

    // Generate random dice (1-6)
    const diceValue = Math.floor(Math.random() * 6) + 1;
    
    // Update game state
    game.gameState.diceValue = diceValue;
    await game.save();

    res.json({ success: true, diceValue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 🏆 SET WINNER & DISTRIBUTE PRIZE
 */
exports.setWinner = async (req, res) => {
  try {
    const { roomId, winnerId } = req.body;
    const game = await Game.findOne({ roomId });

    if (!game || game.status === "finished") {
      return res.status(400).json({ message: "Invalid game state" });
    }

    const winner = await User.findById(winnerId);
    if (!winner) {
      return res.status(404).json({ message: "Winner not found" });
    }

    const totalCollected = (game.entryFee || 0) * 2;
    const adminCommission = totalCollected - (game.prizeMoney || 0);
    const balanceBefore = (winner.wallet.deposit || 0) + (winner.wallet.winnings || 0) + (winner.wallet.bonus || 0);

    winner.wallet.winnings = (winner.wallet.winnings || 0) + (game.prizeMoney || 0);
    game.status = "finished";
    game.winner = winnerId;
    game.adminCommission = adminCommission;

    await winner.save();
    await Transaction.create({
      userId: winnerId,
      type: "commission",
      amount: adminCommission,
      status: "success",
      balanceBefore,
      balanceAfter: balanceBefore,
      walletSource: "all",
      paymentMethod: "internal",
      description: `Commission revenue from Ludo game ${roomId}`,
      ludoGameId: game._id,
      metadata: { gameType: "LUDO" }
    });
    await game.save();

    res.json({ success: true, message: "Prize distributed!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};