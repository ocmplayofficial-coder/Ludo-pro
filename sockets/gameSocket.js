const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Game = require("../models/Game");
const ludoEngine = require("../gameEngine/ludoEngine");

const activeGames = {};
const activeTimers = {};
const activeTurnTimers = {};
const activeQuickTurnTimers = {};
const missedTurnCounts = {};
let waitingPlayers = [];
const onlinePlayers = new Set();

global.ONLINE_USERS = global.ONLINE_USERS || new Map(); 
global.LUDO_ONLINE = global.LUDO_ONLINE || new Set(); 
global.TP_ONLINE = global.TP_ONLINE || new Set(); 
const RECONNECT_TIMEOUT = 30000; 
const CLASSIC_TURN_DURATION = 30; 
const QUICK_TURN_DURATION = 6; // 6 Seconds authoritative circular loop countdown
const TIME_MODE_DURATION = 5 * 60 * 1000; 

const OPPOSITE_COLOR = {
  red: "yellow",
  yellow: "red",
  green: "blue",
  blue: "green",
};

const isAllowedColor = (color) => ["red", "green", "blue", "yellow"].includes(color);
const getOppositeColor = (color) => OPPOSITE_COLOR[color] || "blue";
const normalizeColor = (color) => String(color || "").toLowerCase();
const dbg = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
};

/**
 * 🔐 SOCKET AUTHENTICATION
 */
const authenticateSocket = async (socket, next) => {
  try {
    dbg("SOCKET AUTH PAYLOAD:", socket.handshake.auth);
    const token = socket.handshake.auth?.token || socket.handshake.query?.token || (socket.handshake.headers?.authorization || "").split(" ")[1];
    dbg("SOCKET TOKEN BACKEND:", token);
    if (!token) return next(new Error("Authentication failed: No token"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id name phone wallet status");

    if (!user || user.status === "blocked") return next(new Error("User unauthorized or blocked"));

    socket.userId = user._id.toString();
    socket.user = user; 
    next();
  } catch (err) {
    next(new Error("Auth failed"));
  }
};

module.exports = (gameNamespace) => {
  gameNamespace.use(authenticateSocket);

  gameNamespace.on("connection", (socket) => {
    dbg(`🟢 Game Socket Connected: ${socket.userId}`);
    socket.join(socket.userId);

    onlinePlayers.add(socket.id);
    const userSockets = global.ONLINE_USERS.get(socket.userId) || new Set();
    userSockets.add(socket.id);
    global.ONLINE_USERS.set(socket.userId, userSockets);
    global.LUDO_ONLINE.add(socket.userId);

    const updateStats = async () => {
      try {
        const liveGames = await Game.countDocuments({ status: "playing" });
        const stats = {
          total: global.ONLINE_USERS.size,
          ludo: global.LUDO_ONLINE.size,
          teenPatti: (global.TP_ONLINE && global.TP_ONLINE.size) || 0,
          liveGames
        };

        gameNamespace.server && gameNamespace.server.emit && gameNamespace.server.emit("onlinePlayers", stats);
        gameNamespace.emit("UPDATE_STATS", { online: stats.total, liveGames: stats.liveGames });
        gameNamespace.emit("lobby_stats_update", {
          onlinePlayers: stats.total,
          activeGames: stats.liveGames,
        });
        gameNamespace.emit("UPDATE_ONLINE_COUNT", { count: stats.total });
      } catch (err) {
        console.error("Stats update error:", err);
      }
    };

    updateStats();

    socket.on("GET_ONLINE_COUNT", () => {
      socket.emit("UPDATE_ONLINE_COUNT", { count: global.ONLINE_USERS.size });
    });

    // --- 🎮 JOIN REAL-TIME AUTH ROOM & SYNC RECOVERY ---
    socket.on("joinRoom", async ({ roomId }) => {
      let game = activeGames[roomId];
      let wasOffline = false;

      if (!game) {
        const dbGame = await Game.findOne({ roomId, status: "playing" });
        if (dbGame) {
          activeGames[roomId] = dbGame.toObject();
          game = activeGames[roomId];
        }
      }

      if (game) {
        const player = game.players.find(p => p.userId.toString() === socket.userId);
        wasOffline = player && !player.isOnline;

        if (player) {
          player.isOnline = true;
          player.socketId = socket.id;
          player.lastSeen = new Date();

          const timerKey = `${roomId}-${player.userId}`;
          if (activeTimers[timerKey]) {
            clearTimeout(activeTimers[timerKey]);
            delete activeTimers[timerKey];
          }

          await Game.findOneAndUpdate(
            { roomId, "players.userId": player.userId },
            { $set: { "players.$.isOnline": true, "players.$.socketId": socket.id, "players.$.lastSeen": new Date() } }
          );
        }

        socket.join(roomId);
        // 🔥 Sync with Frontend Structure Event Name
        gameNamespace.to(roomId).emit("GAME_STATE_UPDATE", getGameStateForClient(game));
        scheduleMatchEnd(roomId, activeGames[roomId]);
        if (game.type === "classic") await scheduleClassicTurnTimer(roomId);
        if (game.type === "time") startTimeModeTimer(roomId, activeGames[roomId]);

        if (wasOffline) {
          gameNamespace.to(roomId).emit("playerStatusChanged", {
            userId: player.userId,
            isOnline: true,
            message: "Opponent is back in the game!"
          });
        }
      } else {
        socket.emit("error_msg", "Active game not found.");
      }
    });

    // --- 🎲 AUTHORITATIVE ROLL DICE REQUEST LISTENER ---
    socket.on("ROLL_DICE_REQUEST", ({ roomId, userId }) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing") return;

      const playerIdx = game.gameState.currentTurn;
      const currentPlayer = game.players[playerIdx];
      if (!currentPlayer || currentPlayer.userId.toString() !== userId) return;

      // Reset turn timelines seamlessly on a valid dice intent tap
      clearQuickTurnTimer(roomId);
      clearClassicTurnTimer(roomId);

      const dice = ludoEngine.rollDice();
      game.gameState.diceValue = dice;
      game.currentDiceValue = dice; // Pass through to frontend cube placeholder directly
      game.gameState.turnStartTime = Date.now();
      game.gameState.turnTimeLimit = game.type === "classic" ? CLASSIC_TURN_DURATION : 20;
      resetPlayerMissedCount(roomId, userId);

      const color = currentPlayer.color;
      const moves = ludoEngine.getValidMoves(game.tokens, color, dice, game.type);

      // Symmetrical Event Dispatcher Triggers
      gameNamespace.to(roomId).emit("diceRolled", {
        dice,
        moves,
        turn: playerIdx,
        turnStartTime: game.gameState.turnStartTime,
        turnTimeLimit: game.gameState.turnTimeLimit,
        totalMoves: game.gameState.totalMoves
      });

      gameNamespace.to(roomId).emit("GAME_STATE_UPDATE", getGameStateForClient(game));

      if (moves.length === 0) {
        setTimeout(async () => {
          if (!activeGames[roomId]) return;
          game.gameState.currentTurn = ludoEngine.getNextTurn(playerIdx, game.players.length, dice, false);
          game.gameState.turnStartTime = Date.now();
          
          gameNamespace.to(roomId).emit("turnChanged", {
            turn: game.gameState.currentTurn,
            turnStartTime: game.gameState.turnStartTime,
            turnTimeLimit: game.gameState.turnTimeLimit
          });

          gameNamespace.to(roomId).emit("GAME_STATE_UPDATE", getGameStateForClient(game));
          if (game.type === "classic") await scheduleClassicTurnTimer(roomId);
        }, 1500);
      } else {
        if (game.type === "classic") {
          scheduleClassicTurnTimer(roomId).catch((err) => console.error("Classic timer re-route error:", err));
        }
      }
    });

    // --- 🏃 MOVE TOKEN PROCESSOR ---
    socket.on("moveToken", async ({ roomId, tokenIndex, action }) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing") return;

      const playerIdx = game.gameState.currentTurn;
      const player = game.players[playerIdx];
      if (player.userId.toString() !== socket.userId) return;

      const dice = game.gameState.diceValue;
      if (!dice || dice <= 0) return;

      clearQuickTurnTimer(roomId);
      clearClassicTurnTimer(roomId);

      if (!game.gameState.scores) {
        game.gameState.scores = { red: 0, green: 0, blue: 0, yellow: 0 };
      }

      const result = ludoEngine.processMove(game, player.color, tokenIndex, dice);
      if (!result.success) return socket.emit("error_msg", "Invalid Move Setup");

      game.tokens = result.tokens;
      if (game.type === "turn" && game.totalTurnsLeft > 0) {
        game.totalTurnsLeft -= 1;
      }

      game.gameState.currentTurn = ludoEngine.getNextTurn(playerIdx, game.players.length, dice, result.killed);
      game.gameState.turnStartTime = Date.now();

      // Dynamic score parameters tracking pipeline
      game.players.forEach(p => {
        p.score = game.gameState.scores[p.color] || 0;
      });

      gameNamespace.to(roomId).emit("tokenMoved", {
        tokens: game.tokens,
        color: player.color,
        tokenIndex,
        newSteps: game.tokens[player.color][tokenIndex].steps,
        killed: result.killed,
        killedInfo: result.killedInfo,
        nextTurn: game.gameState.currentTurn,
        scores: game.gameState.scores || {}
      });

      if (result.winner) {
        await handleGameOver(roomId, player.userId);
      } else {
        resetPlayerMissedCount(roomId, player.userId);
        gameNamespace.to(roomId).emit("GAME_STATE_UPDATE", getGameStateForClient(game));
        
        if (game.type === "classic") {
          await scheduleClassicTurnTimer(roomId);
        }
      }
    });

    // --- 🤝 MATCHMAKING HANDLER (WITH PRE-BOUND HEARTS) ---
    const handleJoinMatchmaking = async ({ type, entryFee, selectedColor }) => {
      try {
        const fee = Number(entryFee);
        const requestedColor = normalizeColor(selectedColor);
        const chosenColor = isAllowedColor(requestedColor) ? requestedColor : "red";
        const user = await User.findById(socket.userId);

        const hasBalance = (user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0) >= fee;
        if (!hasBalance) {
          return socket.emit("error_msg", "Insufficient balance to join match.");
        }

        waitingPlayers = waitingPlayers.filter(p => p.userId !== socket.userId);
        
        const opponentIndex = waitingPlayers.findIndex(p => p.type === type && p.entryFee === fee);

        if (opponentIndex === -1) {
          waitingPlayers.push({ userId: socket.userId, socketId: socket.id, type, entryFee: fee, selectedColor: chosenColor });
          return socket.emit("waiting", { message: "Searching for opponent..." });
        }

        const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
        const oppUser = await User.findById(opponent.userId);

        await user.deductEntryFee(fee);
        await oppUser.deductEntryFee(fee);

        const roomId = `TP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const totalPool = fee * 2;
        const adminFee = Math.max(1, Math.ceil(totalPool * 0.02)); 
        const prize = totalPool - adminFee;

        const waitingColor = normalizeColor(opponent.selectedColor || "red");
        const primaryColor = isAllowedColor(waitingColor) ? waitingColor : "red";
        const opponentColor = getOppositeColor(primaryColor);

        const engineState = ludoEngine.initializeGame([primaryColor, opponentColor], type);

        const gameRecord = await Game.create({
          gameId: roomId,
          roomId,
          gameType: "ludo",
          type,
          mode: type || "classic",
          entryFee: fee,
          potAmount: totalPool,
          adminCommission: adminFee,
          prizeMoney: prize,
          players: [
            { userId: oppUser._id, name: oppUser.name, color: primaryColor, socketId: opponent.socketId, lives: 3, score: 0, isOnline: true },
            { userId: user._id, name: user.name, color: opponentColor, socketId: socket.id, lives: 3, score: 0, isOnline: true }
          ],
          status: "playing",
          startedAt: new Date(),
          gameState: engineState,
          tokens: engineState.tokens
        });

        activeGames[roomId] = {
          ...gameRecord.toObject(),
          prizePool: prize.toFixed(2),
          totalTurnsLeft: 25,
          currentDiceValue: 6,
          scores: { [primaryColor]: 0, [opponentColor]: 0 }
        };

        scheduleMatchEnd(roomId, activeGames[roomId]);
        socket.join(roomId);

        const oppSocket = gameNamespace.sockets?.get?.(opponent.socketId) || gameNamespace.sockets?.sockets?.get?.(opponent.socketId);
        if (oppSocket) oppSocket.join(roomId);

        gameNamespace.to(roomId).emit("matchFound", { roomId });
        updateStats();

        setTimeout(() => {
          if (activeGames[roomId]) {
            gameNamespace.to(roomId).emit("GAME_STATE_UPDATE", getGameStateForClient(activeGames[roomId]));
            if (type === "classic") scheduleClassicTurnTimer(roomId);
          }
        }, 1200);

      } catch (err) {
        console.error("Matchmaking Error Framework Fail:", err);
        socket.emit("error_msg", "Matchmaking error context failure.");
      }
    };

    socket.on("joinMatchmaking", handleJoinMatchmaking);
    socket.on("cancelMatchmaking", () => {
      waitingPlayers = waitingPlayers.filter(p => p.userId !== socket.userId);
    });

    // --- ⏱️ DISCONNECT & RECOVERY LOOPS TIMEOUTS ---
    const handleTimeExpired = async (roomId) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing") return;

      clearClassicTurnTimer(roomId);
      clearQuickTurnTimer(roomId);

      const winner = game.players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
      await handleGameOver(roomId, winner.userId, { reason: "Time Over", message: `Match completed! ${winner.name} wins by points.` });
    };

    const scheduleMatchEnd = (roomId, game) => {
      if (!game || game.type !== "time" || !game.timeEndAt) return;
      const remaining = new Date(game.timeEndAt).getTime() - Date.now();
      if (remaining <= 0) return handleTimeExpired(roomId);
      
      if (game.matchTimer) clearTimeout(game.matchTimer);
      game.matchTimer = setTimeout(() => handleTimeExpired(roomId), remaining);
    };

    const startTimeModeTimer = (roomId, game) => {
      if (!game || game.type !== "time") return;
      if (game.timerInterval) clearInterval(game.timerInterval);

      game.timerInterval = setInterval(() => {
        if (!activeGames[roomId]) return clearInterval(game.timerInterval);
        const remaining = Math.max(0, Math.ceil((new Date(game.timeEndAt).getTime() - Date.now()) / 1000));
        gameNamespace.to(roomId).emit("gameTimerUpdate", { gameTimer: remaining });
        if (remaining <= 0) handleTimeExpired(roomId);
      }, 1000);
    };

    const clearClassicTurnTimer = (roomId) => { if (activeTurnTimers[roomId]) clearTimeout(activeTurnTimers[roomId]); };
    const clearQuickTurnTimer = (roomId) => { if (activeQuickTurnTimers[roomId]) clearInterval(activeQuickTurnTimers[roomId]); };

    // 🔥 HIGH-END REFACTORED AUTHORITATIVE 6S TIME ARC TICKER ENGINE
    const startQuickTurnTimer = async (roomId) => {
      clearQuickTurnTimer(roomId);
      const game = activeGames[roomId];
      if (!game || game.status !== 'playing') return;

      let remaining = QUICK_TURN_DURATION;
      gameNamespace.to(roomId).emit('TIMER_TICK', { remainingSeconds: Math.ceil(remaining) });

      activeQuickTurnTimers[roomId] = setInterval(async () => {
        remaining -= 1;
        const tickValue = Math.max(0, remaining);
        
        gameNamespace.to(roomId).emit('TIMER_TICK', { remainingSeconds: tickValue });

        if (remaining <= 0) {
          clearInterval(activeQuickTurnTimers[roomId]);
          await handleQuickTurnTimeout(roomId);
        }
      }, 1000); // 1-Second strict ticks update interval
    };

    const handleQuickTurnTimeout = async (roomId) => {
      const game = activeGames[roomId];
      if (!game || game.status !== 'playing') return;

      const playerIdx = game.gameState.currentTurn;
      const currentPlayer = game.players[playerIdx];
      if (!currentPlayer) return;

      // Deduct lifeline parameters on server state arrays directly
      currentPlayer.lives = Math.max(0, (currentPlayer.lives ?? 3) - 1);

      // 🔥 Broadcast Symmetrical Toast Notification Banner Hook across streams
      gameNamespace.to(roomId).emit('TURN_MISSED_NOTIFICATION', { 
        message: `${currentPlayer.name || 'Opponent'} missed a turn!` 
      });

      if (currentPlayer.lives <= 0) {
        clearQuickTurnTimer(roomId);
        clearClassicTurnTimer(roomId);
        const winner = game.players.find((p, idx) => idx !== playerIdx);
        return handleGameOver(roomId, winner.userId, { reason: 'Timeout Disqualification', message: 'Opponent eliminated by 3 timeouts.' });
      }

      // Automatically advance pointer tracks
      if (game.totalTurnsLeft > 0) game.totalTurnsLeft -= 1;
      
      game.gameState.currentTurn = (playerIdx + 1) % game.players.length;
      game.gameState.turnStartTime = Date.now();

      gameNamespace.to(roomId).emit("turnChanged", {
        turn: game.gameState.currentTurn,
        turnStartTime: game.gameState.turnStartTime,
        turnTimeLimit: CLASSIC_TURN_DURATION
      });

      gameNamespace.to(roomId).emit("GAME_STATE_UPDATE", getGameStateForClient(game));
      scheduleClassicTurnTimer(roomId).catch(e => dbg(e));
    };

    const scheduleClassicTurnTimer = async (roomId) => {
      clearClassicTurnTimer(roomId);
      const game = activeGames[roomId];
      if (!game || game.status !== "playing") return;

      activeTurnTimers[roomId] = setTimeout(() => {
        handleQuickTurnTimeout(roomId);
      }, CLASSIC_TURN_DURATION * 1000);

      // Spark up circular progress track alongside baseline clocks
      startQuickTurnTimer(roomId).catch(e => dbg(e));
    };

    const resetPlayerMissedCount = (roomId, userId) => { if (missedTurnCounts[roomId]) delete missedTurnCounts[roomId][userId]; };
    const getGameStateForClient = (game) => {
      if (!game) return null;
      const { matchTimer, disconnectTimer, timerInterval, ...safeGame } = game;
      return JSON.parse(JSON.stringify(safeGame));
    };

    // --- 🏆 WINNER & PRIZE SETTLEMENT POOL ---
    const handleGameOver = async (roomId, winnerId, options = {}) => {
      const game = activeGames[roomId];
      if (!game) return;
      game.status = "finished";

      try {
        const winner = await User.findById(winnerId);
        winner.wallet.winnings += game.prizeMoney;
        await winner.save();

        await Game.findOneAndUpdate({ roomId }, {
          status: "finished",
          winner: { userId: winnerId, prize: game.prizeMoney },
          finishReason: options.reason || "Game Ended",
          finishedAt: new Date()
        });

        gameNamespace.to(roomId).emit("gameOver", {
          winnerId,
          prize: game.prizeMoney,
          reason: options.reason || "Game Finished",
          message: options.message || "Match finished successfully."
        });

        clearClassicTurnTimer(roomId);
        clearQuickTurnTimer(roomId);
        delete activeGames[roomId];
        updateStats();
      } catch (err) {
        console.error("GameOver Settlement Error:", err);
      }
    };

    socket.on("disconnect", () => {
      waitingPlayers = waitingPlayers.filter(p => p.userId !== socket.userId);
      onlinePlayers.delete(socket.id);
      updateStats();
    });
  });
};
