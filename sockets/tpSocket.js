const jwt = require("jsonwebtoken");
const User = require("../models/User");
const TPGame = require("../models/TPGame");
const tpEngine = require("../gameEngine/teenPattiEngine");
const Match = require("../models/Match");

let tpWaitingPlayers = [];
const TURN_TIME_LIMIT = 20000; // 20 Seconds per turn

/**
 * 🔐 SOCKET AUTH (Same as Ludo for consistency)
 */
const authenticateSocket = async (socket, next) => {
  try {
    console.log("TP SOCKET AUTH PAYLOAD:", socket.handshake.auth);
    const token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    console.log("TP SOCKET TOKEN BACKEND:", token);
    if (!token) return next(new Error("No token"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.status === "blocked") return next(new Error("Blocked"));
    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (err) {
    console.error("TP socket auth error:", err.message);
    next(new Error("Auth failed"));
  }
};

module.exports = (tpNamespace) => {
  if (!tpNamespace) return;
  tpNamespace.use(authenticateSocket);

  tpNamespace.on("connection", (socket) => {
    console.log("🃏 TP Connected:", socket.userId);
    socket.join(socket.userId);

    // 📊 Update Admin Dashboard
    const updateStats = () => {
      tpNamespace.emit("adminUpdate", {
        onlinePlayers: Object.keys(global.ACTIVE_PLAYERS || {}).length,
        activeGames: Object.keys(global.ACTIVE_GAMES || {}).length
      });
    };

    socket.on("joinGame", (gameData) => {
      try {
        if (!gameData || !gameData.id) return;
        global.ACTIVE_MATCHES = global.ACTIVE_MATCHES || [];
        const existingIndex = global.ACTIVE_MATCHES.findIndex((m) => m.id === gameData.id);
        const matchPayload = {
          ...gameData,
          status: gameData.status || "playing",
          players: gameData.players || [],
        };

        if (existingIndex !== -1) {
          global.ACTIVE_MATCHES[existingIndex] = {
            ...global.ACTIVE_MATCHES[existingIndex],
            ...matchPayload,
          };
        } else {
          global.ACTIVE_MATCHES.push(matchPayload);
        }

        tpNamespace.emit("liveMatchesUpdate", global.ACTIVE_MATCHES);
      } catch (err) {
        console.error("TP joinGame live matches error:", err);
      }
    });

    socket.on("endGame", (gameId) => {
      try {
        if (!gameId) return;
        global.ACTIVE_MATCHES = (global.ACTIVE_MATCHES || []).filter((g) => g.id !== gameId);
        tpNamespace.emit("liveMatchesUpdate", global.ACTIVE_MATCHES);
      } catch (err) {
        console.error("TP endGame live matches error:", err);
      }
    });

    /**
     * 🎯 MATCHMAKING
     */
    socket.emit("liveMatchesUpdate", global.ACTIVE_MATCHES || []);

    socket.on("tp_joinMatchmaking", async (data) => {
      try {
        const { userId, name, boot, mode } = data;
        const entryFee = Number(boot);
        const user = await User.findById(userId);

        if (!user || (user.wallet.deposit + user.wallet.winnings < entryFee)) {
          return socket.emit("tp_error", "Low balance to join this table!");
        }

        // Clean queue
        tpWaitingPlayers = tpWaitingPlayers.filter(p => p.userId !== userId);

        const oppIdx = tpWaitingPlayers.findIndex(p => p.boot === entryFee && p.mode === mode);

        if (oppIdx === -1) {
          tpWaitingPlayers.push({ socketId: socket.id, userId, name, boot: entryFee, mode });
          return socket.emit("tp_waiting");
        }

        // START GAME
        const opponent = tpWaitingPlayers.splice(oppIdx, 1)[0];
        const oppUser = await User.findById(opponent.userId);

        // Deduct Boot
        user.wallet.deposit -= entryFee; await user.save();
        oppUser.wallet.deposit -= entryFee; await oppUser.save();

        const roomId = `TP_${Date.now()}`;
        const matchConfig = await Match.findOne({ entryFee, gameType: "teenpatti" });
        const prize = matchConfig ? matchConfig.prizeMoney : (entryFee * 1.9);

        const deck = tpEngine.createDeck();
        const newGame = new TPGame({
          roomId,
          mode,
          bootAmount: entryFee,
          potAmount: entryFee * 2,
          prizeMoney: prize,
          status: "playing",
          currentTurn: 0,
          players: [
            { userId: opponent.userId, name: opponent.name, socketId: opponent.socketId, cards: deck.splice(0, 3), isPacked: false },
            { userId, name, socketId: socket.id, cards: deck.splice(0, 3), isPacked: false }
          ]
        });

        await newGame.save();
        socket.join(roomId);
        const oppSocket = tpNamespace.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(roomId);

        tpNamespace.to(roomId).emit("tp_matchFound", { roomId, prize });
        
        setTimeout(() => {
          tpNamespace.to(roomId).emit("tp_gameState", newGame);
          updateStats();
        }, 1000);

      } catch (err) { console.error("TP Join Error:", err); }
    });

    /**
     * 💰 CHAAL (BETTING)
     */
    socket.on("tp_placeChaal", async ({ roomId, amount }) => {
      try {
        const game = await TPGame.findOne({ roomId });
        if (!game || game.status !== "playing") return;

        const turnIdx = game.currentTurn;
        const player = game.players[turnIdx];

        if (player.userId.toString() !== socket.userId) return;

        // Add to Pot
        game.potAmount += Number(amount);
        
        // Change Turn to next un-packed player
        game.currentTurn = (turnIdx + 1) % game.players.length;
        while(game.players[game.currentTurn].isPacked) {
          game.currentTurn = (game.currentTurn + 1) % game.players.length;
        }

        await game.save();
        tpNamespace.to(roomId).emit("tp_gameState", game);
        tpNamespace.to(roomId).emit("tp_action", { message: `${player.name} placed ₹${amount} Chaal` });

      } catch (err) { console.log(err); }
    });

    /**
     * 📁 PACK (FOLD)
     */
    socket.on("tp_pack", async ({ roomId }) => {
      try {
        const game = await TPGame.findOne({ roomId });
        if (!game) return;

        const player = game.players.find(p => p.userId.toString() === socket.userId);
        if (player) player.isPacked = true;

        await game.save();
        tpNamespace.to(roomId).emit("tp_action", { message: `${player.name} Packed` });
        checkWinner(roomId, game);
      } catch (err) { console.log(err); }
    });

    /**
     * 🏆 WINNER CALCULATION
     */
    const checkWinner = async (roomId, game) => {
      const activePlayers = game.players.filter(p => !p.isPacked);
      
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        game.status = "finished";
        game.winner = winner.userId;
        await game.save();

        // Update Winner Wallet
        const user = await User.findById(winner.userId);
        user.wallet.winnings += game.prizeMoney;
        await user.save();

        tpNamespace.to(roomId).emit("tp_gameOver", { 
          winnerId: winner.userId, 
          winnerName: winner.name, 
          prize: game.prizeMoney 
        });

        updateStats();
      } else {
        tpNamespace.to(roomId).emit("tp_gameState", game);
      }
    };

    /**
     * 🛑 ADMIN COMMANDS
     */
    socket.on("admin_tp_forcePack", async ({ roomId, userId }) => {
      const game = await TPGame.findOne({ roomId });
      if (!game) return;
      const player = game.players.find(p => p.userId.toString() === userId);
      if (player) {
        player.isPacked = true;
        await game.save();
        tpNamespace.to(roomId).emit("tp_action", { message: "Admin forced player to pack" });
        checkWinner(roomId, game);
      }
    });

    socket.on("disconnect", () => {
      tpWaitingPlayers = tpWaitingPlayers.filter(p => p.socketId !== socket.id);
      console.log("🔴 TP Disconnected:", socket.userId || socket.id);
    });
  });
};