const express = require("express");
const router = express.Router();

const Game = require("../models/Game");
const TPGame = require("../models/TPGame");
const Tournament = require("../models/Tournament");
const User = require("../models/User");
const Match = require("../models/Match");
const Transaction = require("../models/Transaction");
const ludoEngine = require("../gameEngine/ludoEngine");

const { auth } = require("./auth");
const tpController = require("../controllers/tpController");
const adminController = require("../controllers/adminController");

// 🛡️ ADMIN CHECK Middleware
const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access only" });
  }
  next();
};

const shuffleArray = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const createTournamentMatches = async (tournament, io) => {
  await tournament.populate("players", "_id name");
  const players = tournament.players.map((player) => ({
    userId: player._id.toString(),
    name: player.name || "Player"
  }));

  const shuffled = shuffleArray(players);
  const matches = [];
  const eventMatches = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const playerA = shuffled[i];
    const playerB = shuffled[i + 1];
    const matchRoomId = `TOUR_${tournament._id}_${Math.floor(i / 2)}_${Date.now()}`;
    const isLudo = tournament.gameType === "ludo";
    const colors = isLudo ? ["red", "blue"] : ["seat1", "seat2"];

    if (!playerB) {
      matches.push({
        roomId: matchRoomId,
        players: [{ userId: playerA.userId, name: playerA.name, seat: colors[0] }]
      });
      eventMatches.push({
        roomId: matchRoomId,
        players: [{ ...playerA, seat: colors[0] }],
        bye: true
      });
      continue;
    }

    if (isLudo) {
      const engineState = ludoEngine.initializeGame(colors, "classic");
      await Game.create({
        roomId: matchRoomId,
        gameType: "ludo",
        type: "classic",
        entryFee: tournament.entryFee,
        prizeMoney: tournament.entryFee * 2,
        status: "playing",
        startedAt: new Date(),
        players: [
          { userId: playerA.userId, name: playerA.name, color: colors[0] },
          { userId: playerB.userId, name: playerB.name, color: colors[1] }
        ],
        playersJoined: 2,
        maxPlayers: 2,
        gameState: engineState,
        tokens: engineState.tokens
      });
    }

    matches.push({
      roomId: matchRoomId,
      players: [
        { userId: playerA.userId, name: playerA.name, seat: colors[0] },
        { userId: playerB.userId, name: playerB.name, seat: colors[1] }
      ]
    });
    eventMatches.push({
      roomId: matchRoomId,
      players: [
        { ...playerA, seat: colors[0] },
        { ...playerB, seat: colors[1] }
      ]
    });
  }

  tournament.matches = matches;
  await tournament.save();

  const tournamentRoom = `tournament_${tournament._id}`;
  if (io) {
    io.to(tournamentRoom).emit("TOURNAMENT_MATCHES", {
      tournamentId: tournament._id,
      matches: eventMatches,
      message: "Tournament bracket generated. Your match is ready."
    });
  }
};

/**
 * 🎲 1. LUDO MATCH LIST (Dynamic from DB)
 * Fixed: Fallback data now includes TURN mode
 */
router.get("/ludo/matches", auth, async (req, res) => {
  try {
    let matches = await Match.find({ gameType: "ludo", isActive: true });

    // 🔥 FALLBACK: Agar database khali hai toh teeno modes dikhayega
    if (matches.length === 0) {
      matches = [
        { _id: "def_l1", type: "classic", entryFee: 10, prizeMoney: 18, label: "STARTER CLASSIC", mode: "classic" },
        { _id: "def_l2", type: "time", entryFee: 50, prizeMoney: 90, label: "PRO TIME", mode: "time" },
        { _id: "def_l3", type: "turn", entryFee: 10, prizeMoney: 18, label: "SKILL TURN", mode: "turn" } // ✅ TURN MODE ADDED
      ];
    }

    res.json({ success: true, matches });
  } catch (err) {
    console.error("Ludo match fetch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * 🎲 2. LUDO ACTIVE TABLES (Admin-created game tables)
 */
router.get("/ludo/tables", auth, async (req, res) => {
  try {
    const tables = await Match.find({ gameType: "ludo", isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, tables });
  } catch (err) {
    console.error("Ludo tables fetch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * 🎲 2a. AVAILABLE TABLES (Active Game Tables for Players)
 */
router.get("/available-tables", auth, async (req, res) => {
  try {
    const { mode } = req.query;
    const filter = { status: "active" };
    if (mode) filter.type = mode;
    const tables = await Game.find(filter).sort({ entryFee: 1, createdAt: -1 });
    res.json({ success: true, tables });
  } catch (err) {
    console.error("Available tables fetch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * 🎲 2b. LIVE TABLES FOR CLIENTS
 */
router.get("/live-tables", auth, async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { status: "active", playersJoined: { $lt: 2 } };
    if (type) filter.type = type;
    const tables = await Game.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, tables });
  } catch (err) {
    console.error("Live tables fetch error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🃏 2. TEEN PATTI MATCH LIST (Dynamic from DB)
 */
router.get("/teenpatti/matches", auth, async (req, res) => {
  try {
    let matches = await Match.find({ gameType: "teenpatti", isActive: true });

    if (matches.length === 0) {
      matches = [
        { _id: "def_tp1", type: "classic", entryFee: 10, prizeMoney: 19, label: "CLASSIC BOOT", mode: "classic" },
        { _id: "def_tp2", type: "muflis", entryFee: 50, prizeMoney: 95, label: "MUFLIS BOOT", mode: "muflis" },
        { _id: "def_tp3", type: "ak47", entryFee: 100, prizeMoney: 190, label: "AK-47 BOOT", mode: "ak47" }
      ];
    }

    res.json({ success: true, matches });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/**
 * 🛠️ 3. ADMIN: CREATE MATCH TABLE
 */
router.post("/admin/create-match", auth, isAdmin, async (req, res) => {
  try {
    const { gameType, type, entryFee, prizeMoney, label, mode, commission, maxPlayers } = req.body;

    const newMatch = new Match({
      gameType,
      type: type || mode, // Frontend use 'type'
      mode: mode || type, // Backend engine use 'mode'
      entryFee,
      prizeMoney,
      label,
      commission: commission || 10,
      maxPlayers: maxPlayers || 2
    });

    await newMatch.save();
    res.json({ success: true, message: "New Price Table Added! 🚀" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error creating match" });
  }
});

/**
 * � 4. ACTIVE TOURNAMENT LIST
 */
router.get("/tournaments", auth, async (req, res) => {
  try {
    const tournaments = await Tournament.find({ status: { $in: ["upcoming", "active", "ongoing", "registration"] } })
      .sort({ createdAt: -1 })
      .lean();

    const normalized = tournaments.map((t) => ({
      ...t,
      playersJoined: Array.isArray(t.players) ? t.players.length : Array.isArray(t.joinedPlayers) ? t.joinedPlayers.length : 0,
      maxPlayers: Number(t.maxPlayers || t.totalSlots || 0),
      name: t.name || t.title || "Untitled Tournament",
      status: t.status || "upcoming"
    }));

    res.json({ success: true, tournaments: normalized });
  } catch (err) {
    console.error("Active tournaments fetch error:", err);
    res.status(500).json({ success: false, message: "Unable to fetch tournaments" });
  }
});

/**
 * 🏆 4a. TOURNAMENT JOIN
 */
router.post(["/tournaments/:id/join", "/tournaments/join/:id"], auth, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, message: "Tournament not found" });

    if (String(tournament.status) !== "upcoming") {
      return res.status(400).json({ success: false, message: "Tournament registration closed" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const entryFee = Number(tournament.entryFee) || 0;
    const balance = Number(user.wallet?.deposit) || 0;
    const players = Array.isArray(tournament.players)
      ? tournament.players
      : Array.isArray(tournament.joinedPlayers)
      ? tournament.joinedPlayers
      : [];
    const maxPlayers = Number(tournament.maxPlayers || tournament.totalSlots || 0);
    const joinedCount = players.length;

    if (balance < entryFee) {
      return res.status(400).json({ success: false, message: "Insufficient Balance" });
    }

    if (players.some((player) => player.toString() === user._id.toString())) {
      return res.status(400).json({ success: false, message: "Already joined" });
    }

    if (maxPlayers > 0 && joinedCount >= maxPlayers) {
      return res.status(400).json({ success: false, message: "Tournament Full" });
    }

    user.wallet.deposit = balance - entryFee;
    tournament.players = players;
    tournament.players.push(user._id);
    tournament.maxPlayers = maxPlayers;

    if (maxPlayers > 0 && tournament.players.length >= maxPlayers) {
      tournament.status = "ongoing";
    }

    await user.save();
    await tournament.save();

    const tournamentIo = tournament.gameType === "teenpatti" ? req.app.get("tpIo") : req.app.get("ludoIo");
    const roomName = `tournament_${tournament._id}`;

    if (tournamentIo) {
      tournamentIo.emit("TOURNAMENT_UPDATE", {
        tournamentId: tournament._id,
        joinedPlayers: tournament.players.length,
        totalSlots: tournament.maxPlayers,
        status: tournament.status,
      });
    }

    if (tournament.players.length >= tournament.maxPlayers && tournamentIo) {
      await createTournamentMatches(tournament, tournamentIo);

      tournamentIo.to(roomName).emit("TOURNAMENT_START", {
        tournamentId: tournament._id,
        title: tournament.name,
        message: `Round 1 is starting now!`,
        prizePool: tournament.prizePool,
        totalPlayers: tournament.maxPlayers,
      });

      tournamentIo.emit("TOURNAMENT_STARTED", {
        tournamentId: tournament._id,
        title: tournament.name,
        message: `Tournament ${tournament.name} is now active!`,
      });
    }

    res.json({ success: true, message: "Joined successfully", tournament });
  } catch (err) {
    console.error("Tournament join error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 💸 5. WITHDRAW REQUEST
 */
router.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount, bankDetails } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is ₹10" });
    }

    if (!bankDetails || typeof bankDetails !== "object") {
      return res.status(400).json({ success: false, message: "Bank details are required" });
    }

    const accountHolderName = String(bankDetails.accountHolderName || "").trim();
    const bankName = String(bankDetails.bankName || "").trim();
    const accountNumber = String(bankDetails.accountNumber || "").trim();
    const ifscCode = String(bankDetails.ifscCode || "").trim();

    if (!accountHolderName || !bankName || !accountNumber || !ifscCode) {
      return res.status(400).json({ success: false, message: "Complete bank details are required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if ((user.wallet.winnings || 0) < numAmount) {
      return res.status(400).json({ success: false, message: "Insufficient winnings balance" });
    }

    const balanceBefore = (user.wallet.deposit || 0) + (user.wallet.winnings || 0) + (user.wallet.bonus || 0);
    user.wallet.winnings -= numAmount;
    await user.save();

    const newTransaction = new Transaction({
      userId: user._id,
      type: "withdraw",
      amount: numAmount,
      status: "pending",
      balanceBefore,
      balanceAfter: balanceBefore - numAmount,
      walletSource: "winning",
      paymentMethod: "manual",
      description: "Withdrawal request pending admin approval",
      bankDetails: {
        accountHolderName,
        accountNumber,
        ifscCode,
        bankName
      }
    });

    await newTransaction.save();
    res.json({ success: true, message: "Withdrawal request placed successfully", transaction: newTransaction });
  } catch (err) {
    console.error("Withdraw request error:", err);
    res.status(500).json({ success: false, message: "Unable to process withdrawal" });
  }
});

/**
 * 🏆 4b. ADMIN: CREATE TOURNAMENT
 */
router.post("/admin/create-tournament", auth, isAdmin, async (req, res) => {
  try {
    const { name, gameType, entryFee, maxPlayers } = req.body;
    if (!gameType || !["ludo", "teenpatti"].includes(gameType)) {
      return res.status(400).json({ success: false, message: "gameType must be 'ludo' or 'teenpatti'" });
    }

    const newTournament = new Tournament({
      name: name || req.body.title || "Untitled Tournament",
      gameType,
      entryFee: Number(entryFee) || 0,
      maxPlayers: Number(maxPlayers) || 2,
      players: [],
      status: "upcoming"
    });

    await newTournament.save();
    res.json({ success: true, message: "Tournament created successfully", tournament: newTournament });
  } catch (err) {
    console.error("Create tournament error:", err);
    res.status(500).json({ success: false, message: "Unable to create tournament" });
  }
});

/**
 * 🃏 5. TEEN PATTI JOIN
 */
router.post("/teenpatti/join", auth, tpController.joinTPRoom);

/**
 * 🎮 5. ROOM DETAILS
 */
router.get("/details/:roomId", auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    let game = await Game.findOne({ roomId });
    if (!game) game = await TPGame.findOne({ roomId });

    if (!game) return res.status(404).json({ success: false, message: "Room not found" });
    res.json({ success: true, game });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/**
 * 📜 6. HISTORY
 */
router.get("/my-history", auth, async (req, res) => {
  try {
    const ludo = await Game.find({ "players.userId": req.user.id, status: "finished" }).sort({createdAt: -1}).limit(10);
    const tp = await TPGame.find({ "players.userId": req.user.id, status: "finished" }).sort({createdAt: -1}).limit(10);
    res.json({ success: true, ludo, teenpatti: tp });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/**
 * 💰 7. ADMIN STATS
 */
router.get("/admin/stats", auth, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeGamesCount = Object.keys(global.ACTIVE_GAMES || {}).length;
    const onlinePlayersCount = Object.keys(global.ACTIVE_PLAYERS || {}).length;

    res.json({
      success: true,
      totalUsers,
      activeGames: activeGamesCount,
      onlinePlayers: onlinePlayersCount
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;