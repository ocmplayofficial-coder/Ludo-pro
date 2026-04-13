const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Game = require("../models/Game");
const ludoEngine = require("../gameEngine/ludoEngine");

const activeGames = {};
const activeTimers = {};
const activeTurnTimers = {};
const missedTurnCounts = {};
let waitingPlayers = [];
const onlinePlayers = new Set();
const RECONNECT_TIMEOUT = 30000; // 30 seconds before auto-win if player does not return
const CLASSIC_TURN_DURATION = 30; // 30 seconds per classic turn
const TIME_MODE_DURATION = 5 * 60 * 1000; // 5 minutes for time mode

const OPPOSITE_COLOR = {
  red: "yellow",
  yellow: "red",
  green: "blue",
  blue: "green",
};

const isAllowedColor = (color) => ["red", "green", "blue", "yellow"].includes(color);
const getOppositeColor = (color) => OPPOSITE_COLOR[color] || "blue";
const normalizeColor = (color) => String(color || "").toLowerCase();


/**
 * 🔐 SOCKET AUTHENTICATION
 */
const authenticateSocket = async (socket, next) => {
  try {
    console.log("SOCKET AUTH PAYLOAD:", socket.handshake.auth);
    const token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    console.log("SOCKET TOKEN BACKEND:", token);
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

const getTournamentRoom = (tournamentId) => `tournament_${tournamentId}`;

module.exports = (gameNamespace) => {
  gameNamespace.use(authenticateSocket);

  gameNamespace.on("connection", (socket) => {
    console.log(`🟢 Game Socket Connected: ${socket.userId}`);
    socket.join(socket.userId);

    onlinePlayers.add(socket.id);

    const updateStats = async () => {
      try {
        const liveGames = await Game.countDocuments({ status: "playing" });
        const stats = { online: onlinePlayers.size, liveGames };
        gameNamespace.emit("UPDATE_STATS", stats);
        gameNamespace.emit("lobby_stats_update", {
          onlinePlayers: stats.online,
          activeGames: stats.liveGames,
        });
        gameNamespace.emit("onlinePlayers", stats.online);
        gameNamespace.emit("UPDATE_ONLINE_COUNT", { count: stats.online });
      } catch (err) {
        console.error("Stats update error:", err);
      }
    };

    updateStats();

    socket.on("GET_ONLINE_COUNT", () => {
      socket.emit("UPDATE_ONLINE_COUNT", { count: onlinePlayers.size });
    });

    socket.on("JOIN_TOURNAMENT_ROOM", ({ tournamentId }) => {
      if (!tournamentId) return;
      const roomName = getTournamentRoom(tournamentId);
      socket.join(roomName);
      socket.emit("JOINED_TOURNAMENT_ROOM", { tournamentId, room: roomName });
    });

    socket.on("get_lobby_stats", async () => {
      try {
        const liveGames = await Game.countDocuments({ status: "playing" });
        socket.emit("lobby_stats_update", {
          onlinePlayers: onlinePlayers.size,
          activeGames: liveGames,
        });
      } catch (err) {
        console.error("get_lobby_stats error:", err);
      }
    });

    socket.on("GET_STATS", async () => {
      try {
        const liveGames = await Game.countDocuments({ status: "playing" });
        socket.emit("UPDATE_STATS", {
          online: onlinePlayers.size,
          liveGames,
        });
      } catch (err) {
        console.error("GET_STATS error:", err);
      }
    });

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

        gameNamespace.emit("liveMatchesUpdate", global.ACTIVE_MATCHES);
      } catch (err) {
        console.error("joinGame live matches error:", err);
      }
    });

    socket.on("endGame", (gameId) => {
      try {
        if (!gameId) return;
        global.ACTIVE_MATCHES = (global.ACTIVE_MATCHES || []).filter((g) => g.id !== gameId);
        gameNamespace.emit("liveMatchesUpdate", global.ACTIVE_MATCHES);
      } catch (err) {
        console.error("endGame live matches error:", err);
      }
    });

    socket.emit("liveMatchesUpdate", global.ACTIVE_MATCHES || []);

    const handleTimeExpired = async (roomId) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing" || game.type !== "time") return;

      if (game.matchTimer) {
        clearTimeout(game.matchTimer);
        delete game.matchTimer;
      }
      if (game.timerInterval) {
        clearInterval(game.timerInterval);
        delete game.timerInterval;
      }

      const scoreEntries = game.players.map((player) => {
        const score = (game.gameState?.scores?.[player.color] ?? 0) ||
          game.tokens[player.color].reduce((sum, token) => sum + (token.steps || 0), 0);
        return { player, score };
      });

      scoreEntries.sort((a, b) => b.score - a.score);
      const top = scoreEntries[0];
      const second = scoreEntries[1];
      const winner = top.player;
      const winnerScore = top.score;
      const loserScore = second?.score ?? 0;
      const tie = second && top.score === second.score;

      await handleGameOver(roomId, winner.userId, {
        reason: "Time Over",
        message: tie
          ? "Time over! Match tied, winner selected by entry order."
          : `Time over! ${winner.name || "Winner"} wins with ${winnerScore} points against ${loserScore}.`
      });
    };

    const scheduleMatchEnd = (roomId, game) => {
      if (!game || game.type !== "time" || !game.timeEndAt) return;
      const remaining = new Date(game.timeEndAt).getTime() - Date.now();
      if (remaining <= 0) {
        return handleTimeExpired(roomId);
      }
      if (activeGames[roomId]?.matchTimer) {
        clearTimeout(activeGames[roomId].matchTimer);
      }
      activeGames[roomId].matchTimer = setTimeout(() => {
        handleTimeExpired(roomId);
      }, remaining);
    };

    const startTimeModeTimer = (roomId, game) => {
      if (!game || game.type !== "time") return;

      if (game.timerInterval) {
        clearInterval(game.timerInterval);
      }

      if (!game.timeEndAt) {
        game.timeEndAt = new Date(Date.now() + TIME_MODE_DURATION);
      }

      const emitTimer = () => {
        if (!activeGames[roomId] || activeGames[roomId].status !== "playing") {
          if (game.timerInterval) {
            clearInterval(game.timerInterval);
            delete game.timerInterval;
          }
          return;
        }

        const remaining = Math.max(
          0,
          Math.ceil((new Date(game.timeEndAt).getTime() - Date.now()) / 1000)
        );

        gameNamespace.to(roomId).emit("gameTimerUpdate", { gameTimer: remaining });

        if (remaining <= 0) {
          if (game.timerInterval) {
            clearInterval(game.timerInterval);
            delete game.timerInterval;
          }
          handleTimeExpired(roomId);
        }
      };

      emitTimer();
      game.timerInterval = setInterval(emitTimer, 1000);
    };

    const clearClassicTurnTimer = (roomId) => {
      if (activeTurnTimers[roomId]) {
        clearTimeout(activeTurnTimers[roomId]);
        delete activeTurnTimers[roomId];
      }
    };

    const resetPlayerMissedCount = (roomId, userId) => {
      if (!missedTurnCounts[roomId]) return;
      delete missedTurnCounts[roomId][userId];
    };

    const scheduleClassicTurnTimer = async (roomId) => {
      clearClassicTurnTimer(roomId);
      const game = activeGames[roomId];
      if (!game || game.status !== "playing" || game.type !== "classic") return;

      game.gameState.turnStartTime = Date.now();
      game.gameState.turnTimeLimit = CLASSIC_TURN_DURATION;

      activeTurnTimers[roomId] = setTimeout(() => {
        handleClassicTurnTimeout(roomId);
      }, CLASSIC_TURN_DURATION * 1000);

      await Game.findOneAndUpdate(
        { roomId },
        {
          "gameState.turnStartTime": game.gameState.turnStartTime,
          "gameState.turnTimeLimit": game.gameState.turnTimeLimit
        }
      );
    };

    const handleClassicTurnTimeout = async (roomId) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing" || game.type !== "classic") return;

      const currentIndex = game.gameState.currentTurn;
      const currentPlayer = game.players[currentIndex];
      if (!currentPlayer) return;

      const userId = currentPlayer.userId.toString();
      missedTurnCounts[roomId] = missedTurnCounts[roomId] || {};
      missedTurnCounts[roomId][userId] = (missedTurnCounts[roomId][userId] || 0) + 1;

      const opponent = game.players.find((p) => p.userId.toString() !== userId);
      if (!opponent) return;

      if (missedTurnCounts[roomId][userId] >= 2) {
        clearClassicTurnTimer(roomId);
        return handleGameOver(roomId, opponent.userId, {
          reason: "Timeout Loss",
          message: "Opponent missed two turns. You win by timeout."
        });
      }

      game.gameState.currentTurn = ludoEngine.getNextTurn(currentIndex, game.players.length, 0, false);
      game.gameState.turnStartTime = Date.now();
      game.gameState.turnTimeLimit = CLASSIC_TURN_DURATION;

      gameNamespace.to(roomId).emit("turnMissedAlert", {
        userId,
        message: "1st Warning: You missed your turn. Turn skipped."
      });

      await Game.findOneAndUpdate(
        { roomId },
        {
          "gameState.currentTurn": game.gameState.currentTurn,
          "gameState.turnStartTime": game.gameState.turnStartTime,
          "gameState.turnTimeLimit": game.gameState.turnTimeLimit
        }
      );

      gameNamespace.to(roomId).emit("turnChanged", {
        turn: game.gameState.currentTurn,
        turnStartTime: game.gameState.turnStartTime,
        turnTimeLimit: game.gameState.turnTimeLimit,
        message: "Chance skipped due to timeout!"
      });

      await scheduleClassicTurnTimer(roomId);
    };

    const getGameStateForClient = (game) => {
      if (!game) return null;
      const { matchTimer, disconnectTimer, timerInterval, scores, ...safeGame } = game;
      return JSON.parse(JSON.stringify(safeGame));
    };

    socket.on("checkActiveGame", async () => {
      try {
        let activeGame = Object.values(activeGames).find(
          (g) => g.status === "playing" && g.players.some((p) => p.userId.toString() === socket.userId)
        );

        if (!activeGame) {
          const dbGame = await Game.findOne({ "players.userId": socket.userId, status: "playing" });
          if (dbGame) {
            activeGame = dbGame.toObject();
          }
        }

        if (!activeGame) return;

        socket.emit("activeGameFound", { roomId: activeGame.roomId });
      } catch (err) {
        console.error("Active game recovery error:", err);
      }
    });

    /**
     * 🎯 MATCHMAKING LOGIC
     */
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

        // Remove duplicates from queue
        waitingPlayers = waitingPlayers.filter(p => p.userId !== socket.userId);
        
        // Find Opponent
        const opponentIndex = waitingPlayers.findIndex(p => p.type === type && p.entryFee === fee);

        if (opponentIndex === -1) {
          waitingPlayers.push({ userId: socket.userId, socketId: socket.id, type, entryFee: fee, selectedColor: chosenColor });
          return socket.emit("waiting", { message: "Searching for opponent..." });
        }

        // 🤝 MATCH FOUND!
        const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
        const oppUser = await User.findById(opponent.userId);

        // Double check opponent eligibility before starting
        const oppHasBalance = (oppUser.wallet?.deposit || 0) + (oppUser.wallet?.winnings || 0) + (oppUser.wallet?.bonus || 0) >= fee;
        if (!oppHasBalance) {
          return socket.emit("error_msg", "Opponent no longer eligible.");
        }

        // 4. DEDUCT ENTRY FEE (Priority Logic)
        await user.deductEntryFee(fee);
        await oppUser.deductEntryFee(fee);

        // 5. INITIALIZE DB RECORD
        const roomId = `TP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const totalPool = fee * 2;
        const adminFee = Math.max(1, Math.ceil(totalPool * 0.02)); // 2% admin fee minimum 1
        const prize = totalPool - adminFee;

        // Decide final player colors
        const waitingColor = normalizeColor(opponent.selectedColor || "red");
        const primaryColor = isAllowedColor(waitingColor) ? waitingColor : "red";
        const opponentColor = getOppositeColor(primaryColor);

        const firstPlayerColor = primaryColor;
        const secondPlayerColor = opponentColor;

        const engineState = ludoEngine.initializeGame([firstPlayerColor, secondPlayerColor], type);

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
            { userId: oppUser._id, name: oppUser.name, color: firstPlayerColor, socketId: opponent.socketId },
            { userId: user._id, name: user.name, color: secondPlayerColor, socketId: socket.id }
          ],
          status: "playing",
          startedAt: new Date(),
          timeEndAt: type === "time" ? new Date(Date.now() + TIME_MODE_DURATION) : null,
          gameState: engineState,
          tokens: engineState.tokens
        });

        console.log("✅ Match saved for Admin Panel:", roomId);

        // 6. INITIALIZE ENGINE & STATE
        activeGames[roomId] = {
          ...gameRecord.toObject(),
          scores: { [firstPlayerColor]: 0, [secondPlayerColor]: 0 }
        };

        // Schedule the time-mode end if needed
        scheduleMatchEnd(roomId, activeGames[roomId]);
        if (type === "classic") await scheduleClassicTurnTimer(roomId);
        if (type === "time") startTimeModeTimer(roomId, activeGames[roomId]);

        // 7. JOIN ROOMS
        socket.join(roomId);

        const adapter = gameNamespace.adapter;
        if (!adapter || !adapter.rooms) {
          console.error("❌ Socket adapter not found or rooms unavailable");
        } else {
          const room = adapter.rooms.get(roomId);
          const numClients = room ? room.size : 0;
          console.log(`🔎 Room ${roomId} currently has ${numClients} connected client(s)`);
        }

        const oppSocket = gameNamespace.sockets?.get?.(opponent.socketId)
          ?? gameNamespace.sockets?.sockets?.get?.(opponent.socketId)
          ?? null;
        if (oppSocket) {
          oppSocket.join(roomId);
        } else {
          console.warn("⚠️ Opponent socket not found for matchmaking:", opponent.socketId);
        }

        // 8. 🏁 EMIT EVENTS
        gameNamespace.to(roomId).emit("matchFound", { roomId });
        gameNamespace.to(roomId).emit("GAME_STARTING", {
          success: true,
          roomId,
          players: activeGames[roomId].players,
          mode: activeGames[roomId].type
        });
        gameNamespace.to(roomId).emit("GAME_STARTED", {
          success: true,
          roomId,
          mode: gameRecord.mode
        });
        updateStats();

        // Delayed state to sync with frontend navigation
        setTimeout(() => {
          if (activeGames[roomId]) {
            gameNamespace.to(roomId).emit("gameState", getGameStateForClient(activeGames[roomId]));
          }
        }, 1200);

      } catch (err) {
        console.error("Matchmaking Error:", err);
        socket.emit("error_msg", "Matchmaking failed. Please try again.");
      }
    };

    socket.on("joinMatchmaking", handleJoinMatchmaking);
    socket.on("JOIN_GAME", async ({ gameType, gameMode, entryFee, selectedColor }) => {
      return handleJoinMatchmaking({
        type: String(gameMode || gameType || "classic"),
        entryFee,
        selectedColor
      });
    });
    socket.on("cancelMatchmaking", () => {
      waitingPlayers = waitingPlayers.filter(p => p.userId !== socket.userId);
      socket.emit("matchmakingError", { message: "Matchmaking cancelled." });
    });

    /**
     * 🎯 JOIN ROOM (Recovery)
     */
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
        socket.emit("gameState", getGameStateForClient(game));
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

    socket.on("rejoinGame", async ({ roomId }) => {
      let game = activeGames[roomId];
      if (!game) {
        const dbGame = await Game.findOne({ roomId, status: "playing" });
        if (dbGame) {
          activeGames[roomId] = dbGame.toObject();
          game = activeGames[roomId];
        }
      }

      if (!game) return;
      const player = game.players.find((p) => p.userId.toString() === socket.userId);
      if (!player) return;

      const timerKey = `${roomId}-${player.userId}`;
      if (activeTimers[timerKey]) {
        clearTimeout(activeTimers[timerKey]);
        delete activeTimers[timerKey];
      }

      player.isOnline = true;
      player.socketId = socket.id;
      player.lastSeen = new Date();

      await Game.findOneAndUpdate(
        { roomId, "players.userId": player.userId },
        { $set: { "players.$.isOnline": true, "players.$.socketId": socket.id, "players.$.lastSeen": new Date() } }
      );

      socket.join(roomId);
      socket.emit("gameState", getGameStateForClient(game));
      scheduleMatchEnd(roomId, activeGames[roomId]);
      if (game.type === "time") startTimeModeTimer(roomId, activeGames[roomId]);
      gameNamespace.to(roomId).emit("playerStatusChanged", {
        userId: player.userId,
        isOnline: true,
        message: "Opponent rejoined the game!"
      });
    });

    socket.on("leaveGame", async ({ roomId }) => {
      const game = activeGames[roomId] || await Game.findOne({ roomId, status: "playing" });
      if (!game || game.status !== "playing") return;

      const player = game.players.find((p) => p.userId.toString() === socket.userId);
      if (!player) return;

      player.isOnline = false;
      player.socketId = null;
      player.lastSeen = new Date();

      await Game.findOneAndUpdate(
        { roomId, "players.userId": player.userId },
        { $set: { "players.$.isOnline": false, "players.$.socketId": null, "players.$.lastSeen": new Date() } }
      );

      gameNamespace.to(roomId).emit("playerStatusChanged", {
        userId: player.userId,
        isOnline: false,
        message: "Opponent left the game. They have 30 seconds to return."
      });

      const timerKey = `${roomId}-${player.userId}`;
      if (activeTimers[timerKey]) {
        clearTimeout(activeTimers[timerKey]);
      }

      activeTimers[timerKey] = setTimeout(async () => {
        const finalCheck = await Game.findOne({ roomId, status: "playing" });
        if (!finalCheck) return;

        const pStatus = finalCheck.players.find((p) => p.userId.toString() === player.userId.toString());
        if (!pStatus || pStatus.isOnline) return;

        const winner = finalCheck.players.find((p) => p.userId.toString() !== player.userId.toString());
        if (!winner) return;

        finalCheck.status = "finished";
        finalCheck.winner = { userId: winner.userId, prize: finalCheck.prizeMoney };
        finalCheck.finishReason = "Opponent Disconnected";
        finalCheck.finishedAt = new Date();
        await finalCheck.save();

        await User.findByIdAndUpdate(winner.userId, {
          $inc: { "wallet.winnings": finalCheck.prizeMoney }
        });

        gameNamespace.to(roomId).emit("gameOver", {
          winnerId: winner.userId,
          prize: finalCheck.prizeMoney,
          message: "Opponent didn't return in 30s. You won!",
          reason: "Opponent Left"
        });

        delete activeGames[roomId];
        delete activeTimers[timerKey];
      }, RECONNECT_TIMEOUT);
    });

    /**
     * 🎲 ROLL DICE
     */
    socket.on("rollDice", ({ roomId }) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing") return;

      const playerIdx = game.gameState.currentTurn;
      if (game.players[playerIdx].userId.toString() !== socket.userId) return;

      const dice = ludoEngine.rollDice();
      game.gameState.diceValue = dice;
      game.gameState.turnStartTime = Date.now();
      game.gameState.turnTimeLimit = game.type === "classic" ? CLASSIC_TURN_DURATION : 20;
      resetPlayerMissedCount(roomId, socket.userId);
      const color = game.players[playerIdx].color;
      const moves = ludoEngine.getValidMoves(game.tokens, color, dice, game.type);
      if (game.type === "classic") {
        scheduleClassicTurnTimer(roomId).catch((err) => console.error("Classic timer start error:", err));
      }

      gameNamespace.to(roomId).emit("diceRolled", {
        dice,
        moves,
        turn: playerIdx,
        turnStartTime: game.gameState.turnStartTime,
        turnTimeLimit: game.gameState.turnTimeLimit,
        totalMoves: game.gameState.totalMoves
      });

      // Auto-skip if no moves possible
      if (moves.length === 0) {
        setTimeout(() => {
          if (!activeGames[roomId]) return;
          game.gameState.currentTurn = ludoEngine.getNextTurn(playerIdx, 2, dice, false);
          game.gameState.turnStartTime = Date.now();
          game.gameState.turnTimeLimit = game.type === "classic" ? CLASSIC_TURN_DURATION : 20;

          if (game.type === "classic") {
            scheduleClassicTurnTimer(roomId).catch((err) => console.error("Classic timer start error:", err));
          }

          gameNamespace.to(roomId).emit("turnChanged", {
            turn: game.gameState.currentTurn,
            turnStartTime: game.gameState.turnStartTime,
            turnTimeLimit: game.gameState.turnTimeLimit
          });
        }, 1500);
      }
    });

    /**
     * 🏃 MOVE TOKEN
     */
    socket.on("moveToken", async ({ roomId, tokenIndex, action }) => {
      const game = activeGames[roomId];
      if (!game || game.status !== "playing") return;

      const playerIdx = game.gameState.currentTurn;
      const player = game.players[playerIdx];
      if (player.userId.toString() !== socket.userId) return;

      const dice = game.gameState.diceValue;
      if (!dice || dice <= 0) return;

      if (!game.gameState.scores) {
        game.gameState.scores = { red: 0, green: 0, blue: 0, yellow: 0 };
      } else {
        game.gameState.scores = {
          red: game.gameState.scores.red || 0,
          green: game.gameState.scores.green || 0,
          blue: game.gameState.scores.blue || 0,
          yellow: game.gameState.scores.yellow || 0
        };
      }
      const token = game.tokens[player.color]?.[tokenIndex];
      if (!token) return;

      if (action === "LAUNCH" && dice !== 6 && token.position === -1) return;
      if (action === "MOVE" && token.position === -1) return;

      const result = ludoEngine.processMove(game, player.color, tokenIndex, dice);

      if (!result.success) return socket.emit("error_msg", "Invalid Move");

      // Sync State with Engine
      game.tokens = result.tokens;
      if (game.type === "turn") {
        game.gameState.totalMoves = Math.max(0, (typeof game.gameState.totalMoves === "number" ? game.gameState.totalMoves : 25) - 1);
      }
      game.gameState.currentTurn = ludoEngine.getNextTurn(playerIdx, 2, dice, result.killed);
      game.gameState.turnStartTime = Date.now();
      game.gameState.turnTimeLimit = 20;

      gameNamespace.to(roomId).emit("tokenMoved", {
        tokens: game.tokens,
        color: player.color,
        tokenIndex,
        newSteps: game.tokens[player.color][tokenIndex].steps,
        killed: result.killed,
        killedInfo: result.killedInfo,
        nextTurn: game.gameState.currentTurn,
        totalMoves: game.gameState.totalMoves,
        scores: game.gameState.scores || {}
      });

      if (result.winner) {
        handleGameOver(roomId, player.userId);
      } else {
        resetPlayerMissedCount(roomId, player.userId);
        if (game.type === "classic") {
          await scheduleClassicTurnTimer(roomId);
        }
        if (game.type === "turn" && game.gameState.totalMoves <= 0) {
          const winnerPlayer = game.players.reduce((best, p) => {
            const score = game.gameState.scores?.[p.color] ?? 0;
            if (!best || score > best.score) return { player: p, score };
            return best;
          }, null);
          if (winnerPlayer) {
            handleGameOver(roomId, winnerPlayer.player.userId, {
              reason: "Turn Limit Reached",
              message: `${winnerPlayer.player.name || 'Winner'} wins after 25 turns with ${winnerPlayer.score} points.`
            });
          }
        } else {
          // Broadcast turn change after move
          gameNamespace.to(roomId).emit("turnChanged", {
            turn: game.gameState.currentTurn,
            turnStartTime: game.gameState.turnStartTime,
            turnTimeLimit: game.gameState.turnTimeLimit,
            totalMoves: game.gameState.totalMoves
          });
        }
      }
    });

    /**
     * 🏆 WINNER & PRIZE SETTLEMENT
     */
    const handleGameOver = async (roomId, winnerId, options = {}) => {
      const game = activeGames[roomId];
      if (!game) return;
      game.status = "finished";

      try {
        const winner = await User.findById(winnerId);
        winner.wallet.winnings += game.prizeMoney;
        await winner.save();

        const update = {
          status: "finished",
          winner: { userId: winnerId, prize: game.prizeMoney },
          finishedAt: new Date()
        };
        if (options.reason) update.finishReason = options.reason;

        await Game.findOneAndUpdate({ roomId }, update);

        const winnerPlayer = game.players.find(p => p.userId.toString() === winnerId.toString());
        gameNamespace.to(roomId).emit("gameOver", {
          winner: winnerId,
          winnerId,
          prize: game.prizeMoney,
          name: winnerPlayer?.name || 'Winner',
          avatar: winnerPlayer?.avatar || '/assets/avatar-1.png',
          color: winnerPlayer?.color || 'red',
          totalMoves: game.gameState.totalMoves,
          scores: game.gameState.scores,
          reason: options.reason || "Game Finished",
          message: options.message || "Game finished."
        });

        if (game.disconnectTimer) {
          clearTimeout(game.disconnectTimer);
          delete game.disconnectTimer;
        }
        if (game.timerInterval) {
          clearInterval(game.timerInterval);
          delete game.timerInterval;
        }
        clearClassicTurnTimer(roomId);
        if (missedTurnCounts[roomId]) {
          delete missedTurnCounts[roomId];
        }

        delete activeGames[roomId];
        updateStats();
      } catch (err) {
        console.error("GameOver Settlement Error:", err);
      }
    };

    socket.on("disconnect", async () => {
      waitingPlayers = waitingPlayers.filter(p => p.userId !== socket.userId);
      onlinePlayers.delete(socket.id);
      updateStats();

      try {
        const room = Object.values(activeGames).find(
          (g) => g.status === "playing" && g.players.some((p) => p.socketId === socket.id)
        );
        if (!room) return;

        const roomId = room.roomId;
        const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
        if (playerIndex === -1) return;

        const player = room.players[playerIndex];
        player.isOnline = false;
        player.socketId = null;
        player.lastSeen = new Date();

        await Game.findOneAndUpdate(
          { roomId, "players.userId": player.userId },
          { $set: { "players.$.isOnline": false, "players.$.socketId": null, "players.$.lastSeen": new Date() } }
        );

        gameNamespace.to(roomId).emit("playerStatusChanged", {
          userId: player.userId,
          isOnline: false,
          message: "Opponent disconnected. They have 30 seconds to return."
        });

        const timerKey = `${roomId}-${player.userId}`;
        if (activeTimers[timerKey]) {
          clearTimeout(activeTimers[timerKey]);
        }

        activeTimers[timerKey] = setTimeout(async () => {
          const finalCheck = await Game.findOne({ roomId, status: "playing" });
          if (!finalCheck) return;

          const pStatus = finalCheck.players.find((p) => p.userId.toString() === player.userId.toString());
          if (!pStatus || pStatus.isOnline) return;

          const winner = finalCheck.players.find((p) => p.userId.toString() !== player.userId.toString());
          if (!winner) return;

          finalCheck.status = "finished";
          finalCheck.winner = { userId: winner.userId, prize: finalCheck.prizeMoney };
          finalCheck.finishReason = "Opponent Disconnected";
          finalCheck.finishedAt = new Date();
          await finalCheck.save();

          await User.findByIdAndUpdate(winner.userId, {
            $inc: { "wallet.winnings": finalCheck.prizeMoney }
          });

          gameNamespace.to(roomId).emit("gameOver", {
            winnerId: winner.userId,
            prize: finalCheck.prizeMoney,
            message: "Opponent didn't return in 30s. You won!",
            reason: "Opponent Left"
          });

          delete activeGames[roomId];
          delete activeTimers[timerKey];
        }, RECONNECT_TIMEOUT);
      } catch (err) {
        console.error("Disconnect handling error:", err);
      }
    });
  });
};
