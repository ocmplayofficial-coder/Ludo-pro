import { createLudoRoom, getLudoRoom } from '../game-engine/ludo/roomManager.js';
import { rollDice } from '../game-engine/ludo/diceEngine.js';
import { hasAnyPlayableMoves, canTokenMove } from '../game-engine/ludo/validator.js';
import { moveToken } from '../game-engine/ludo/movementEngine.js';
import { evaluateCaptures } from '../game-engine/ludo/killEngine.js';
import { hasAllTokensReachedHome } from '../game-engine/ludo/homeEngine.js';
import { awardWinner } from '../game-engine/ludo/rewardEngine.js';
import { switchTurn } from '../game-engine/ludo/turnManager.js';
import { evaluateWinnerByScore, calculateScores, calculatePlayerScore } from '../game-engine/ludo/winnerEngine.js';
import { getLudoCommonTrackCell } from '../game-engine/ludo/pathEngine.js';
import { SAFE_CELLS } from '../game-engine/ludo/safeZoneEngine.js';
import { UserModel } from '../models/user.model.js';
import { db } from '../config/db.js';

function normalizeMatchmakingQueueKey(entryFee, variant) {
  const fee = Number(entryFee);
  const normalizedFee = Number.isFinite(fee) ? fee : entryFee;
  const normalizedVariant = String(variant || '').toUpperCase().trim();
  return `${normalizedFee}:${normalizedVariant}`;
}

function broadcastLudoQueueUpdate(queueKey) {
  if (global.ludoNamespace) {
    const q = global.__matchmakingQueue?.get(queueKey);
    const count = q ? q.length : 0;
    global.ludoNamespace.emit('QUEUE_UPDATE', { queueKey, count, gameType: 'ludo' });
  }
}

function withMatchmakingLock(queueKey, callback) {
  if (!global.__matchmakingLocks) {
    global.__matchmakingLocks = new Map();
  }

  const previous = global.__matchmakingLocks.get(queueKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  global.__matchmakingLocks.set(queueKey, previous.then(() => current, () => current));

  return previous.then(async () => {
    try {
      return await callback();
    } finally {
      if (release) release();
    }
  });
}

async function finishGameAndAward(game, winnerColor) {
  game.winner = winnerColor;
  game.status = 'FINISHED';

  if (global.__ludoGameIntervals && global.__ludoGameIntervals.has(game.matchId)) {
    clearInterval(global.__ludoGameIntervals.get(game.matchId));
    global.__ludoGameIntervals.delete(game.matchId);
    console.log(`[Timer] Cleared game interval for ${game.matchId} on conclusion`);
  }

  try {
    const redPlayerId = game.players.red.userId;
    const yellowPlayerId = game.players.yellow?.userId;

    const redUser = await UserModel.findById(redPlayerId);
    const yellowUser = yellowPlayerId ? await UserModel.findById(yellowPlayerId) : null;

    if (winnerColor === 'red') {
      if (redUser) {
        await awardWinner(redUser, game.winningPrize, game.variant);
      }
      if (yellowUser) {
        yellowUser.gamesPlayed += 1;
        await yellowUser.save();
      }
    } else if (winnerColor === 'yellow') {
      if (yellowUser) {
        await awardWinner(yellowUser, game.winningPrize, game.variant);
      }
      if (redUser) {
        redUser.gamesPlayed += 1;
        await redUser.save();
      }
    } else if (winnerColor === 'draw') {
      // Refund entry fee on draw
      const entryFee = game.entryFee;
      if (redUser) {
        redUser.walletBalance = (redUser.walletBalance || 0) + entryFee;
        redUser.depositBalance = (redUser.depositBalance || 0) + entryFee;
        redUser.gamesPlayed += 1;
        await redUser.save();
        try {
          const { addTransaction } = await import('../wallet/transaction.service.js');
          addTransaction({ type: 'REFUND', amount: entryFee, status: 'SUCCESS', method: `Ludo Draw Refund` }, redUser);
        } catch (err) { }
      }
      if (yellowUser) {
        yellowUser.walletBalance = (yellowUser.walletBalance || 0) + entryFee;
        yellowUser.depositBalance = (yellowUser.depositBalance || 0) + entryFee;
        yellowUser.gamesPlayed += 1;
        await yellowUser.save();
        try {
          const { addTransaction } = await import('../wallet/transaction.service.js');
          addTransaction({ type: 'REFUND', amount: entryFee, status: 'SUCCESS', method: `Ludo Draw Refund` }, yellowUser);
        } catch (err) { }
      }
    }
  } catch (err) {
    console.error("Error awarding ludo winner:", err);
  }
}

function broadcastGameUpdate(game) {
  if (global.ludoNamespace) {
    console.log("SOCKET_BROADCAST_GAME_UPDATE", game.matchId);
    global.ludoNamespace.to(game.matchId).emit('GAME_UPDATE', game);
  }
}

export class LudoService {
  static startGameTimer(gameId) {
    if (!global.__ludoGameIntervals) {
      global.__ludoGameIntervals = new Map();
    }

    if (global.__ludoGameIntervals.has(gameId)) {
      clearInterval(global.__ludoGameIntervals.get(gameId));
    }

    const intervalId = setInterval(async () => {
      try {
        const game = getLudoRoom(gameId);
        if (!game || game.status !== 'PLAYING') {
          clearInterval(intervalId);
          global.__ludoGameIntervals.delete(gameId);
          return;
        }

        // 1. Tick turn timer
        game.turnTimerRemaining = (game.turnTimerRemaining || 18) - 1;
        console.log('TIMER_TICK');
        if (game.turnTimerRemaining <= 0) {
          console.log(`[Timer] Timeout tick occurred for game ${gameId}`);
          await LudoService.timeout(gameId);
        }

        // 2. Tick match timer for TIME mode
        if (game.variant === 'TIME') {
          game.timerRemaining = (game.timerRemaining || 300) - 1;
          // console.log('TIMER_TICK'); // removed duplicate
          console.log('[Timer] TIMER_TICK match timer', game.timerRemaining);
          if (game.timerRemaining <= 0) {
            console.log(`[Timer] Time Mode expired for game ${gameId}`);
            await LudoService.endTimeMode(gameId);
            clearInterval(intervalId);
            global.__ludoGameIntervals.delete(gameId);
            return;
          }
        }

        broadcastGameUpdate(game);
      } catch (err) {
        console.error(`Error in game timer loop for game ${gameId}:`, err);
      }
    }, 1000);

    global.__ludoGameIntervals.set(gameId, intervalId);
    console.log(`[Timer] Started game timer for room ${gameId}`);
  }

  static async matchmaking(user, variant, entryFee) {
    if (!global.__matchmakingQueue) {
      global.__matchmakingQueue = new Map();
    }
    if (!global.__matchmakingRefunds) {
      global.__matchmakingRefunds = new Map();
    }

    const queueKey = normalizeMatchmakingQueueKey(entryFee, variant);
    const userIdStr = user._id.toString();
    const normalizedVariant = String(variant || '').toUpperCase().trim();
    const fee = parseFloat(entryFee);

    console.log('MATCHMAKING_REQUEST', {
      username: user.username,
      userId: userIdStr,
      variant: normalizedVariant,
      entryFee: fee,
      queueKey,
      env: process.env.NODE_ENV || 'unknown'
    });

    if (!Number.isFinite(fee) || fee <= 0) {
      throw new Error('Invalid entry fee.');
    }

    if (user.walletBalance < fee) throw new Error('Insufficient wallet balance.');
    if (user.depositBalance >= fee) {
      user.depositBalance -= fee;
    } else {
      const rest = fee - user.depositBalance;
      user.depositBalance = 0;
      user.winningsBalance = Math.max(0, user.winningsBalance - rest);
    }
    user.walletBalance = Math.max(0, user.walletBalance - fee);

    try {
      await user.save();
    } catch (err) {
      console.warn('Failed to persist user balance after matchmaking deduction', err);
    }

    try {
      const { addTransaction } = await import('../wallet/transaction.service.js');
      addTransaction({ type: 'ENTRY_FEE', amount: fee, method: `Ludo Matchmaking (${normalizedVariant})` }, user);
    } catch (err) {
      console.warn('Failed to record matchmaking transaction', err);
    }

    return await withMatchmakingLock(queueKey, async () => {
      const queue = global.__matchmakingQueue.get(queueKey) || [];
      console.log('QUEUE_BEFORE_JOIN', {
        queueKey,
        queueLength: queue.length,
        waitingRoomIds: queue.map(item => item.game.matchId),
        userId: userIdStr
      });

      const sameQueue = queue;
      const existingIndex = sameQueue.findIndex(item => item.user._id.toString() === userIdStr);
      if (existingIndex !== -1) {
        const existingItem = sameQueue[existingIndex];
        console.log('PLAYER_ALREADY_IN_QUEUE', {
          queueKey,
          userId: userIdStr,
          existingMatchId: existingItem.game.matchId
        });
        return {
          ...existingItem.game,
          status: 'MATCHMAKING'
        };
      }

      for (const [k, q] of global.__matchmakingQueue.entries()) {
        if (k !== queueKey) {
          const idx = q.findIndex(item => item.user._id.toString() === userIdStr);
          if (idx !== -1) {
            console.log('CLEANING_UP_DUPLICATE_QUEUE', { queueKey: k, userId: userIdStr });
            const item = q[idx];
            q.splice(idx, 1);
            if (q.length === 0) {
              global.__matchmakingQueue.delete(k);
            } else {
              global.__matchmakingQueue.set(k, q);
            }
            broadcastLudoQueueUpdate(k);
          }
        }
      }

      const waitingIndex = queue.findIndex(item => item.user._id.toString() !== userIdStr);
      if (waitingIndex !== -1) {
        const waiting = queue[waitingIndex];
        queue.splice(waitingIndex, 1);
        if (queue.length === 0) {
          global.__matchmakingQueue.delete(queueKey);
        } else {
          global.__matchmakingQueue.set(queueKey, queue);
        }
        broadcastLudoQueueUpdate(queueKey);

        const game = waiting.game;
        game.players.yellow = { userId: user._id, username: user.username, avatar: user.avatar };
        game.status = 'PLAYING_PENDING';
        game.waitingForPlayers = true;

        try {
          const timerKey = waiting.game.matchId;
          const tId = global.__matchmakingRefunds.get(timerKey);
          if (tId) {
            clearTimeout(tId);
            global.__matchmakingRefunds.delete(timerKey);
          }
        } catch (err) {
          console.warn('Failed clearing refund timer for matched game', err);
        }

        console.log('MATCH_FOUND', {
          queueKey,
          selectedRoom: game.matchId,
          waitingUserId: waiting.user._id.toString(),
          joiningUserId: userIdStr
        });

        if (global.ludoNamespace) {
          console.log('EMITTING GAME_UPDATE and MATCH_FOUND to waiting players:', game.matchId);
          global.ludoNamespace.to(game.matchId).emit('GAME_UPDATE', game);
          global.ludoNamespace.to(waiting.user._id.toString()).emit('MATCH_FOUND', { roomId: game.matchId, players: game.players });
          global.ludoNamespace.to(userIdStr).emit('MATCH_FOUND', { roomId: game.matchId, players: game.players });
          global.ludoNamespace.to(waiting.user._id.toString()).emit('GAME_UPDATE', game);
          global.ludoNamespace.to(userIdStr).emit('GAME_UPDATE', game);
        }

        return game;
      }

      const game = createLudoRoom(user, normalizedVariant, fee);
      const freshQueue = global.__matchmakingQueue.get(queueKey) || [];
      freshQueue.push({ user, game });
      global.__matchmakingQueue.set(queueKey, freshQueue);
      broadcastLudoQueueUpdate(queueKey);

      console.log('NEW_MATCHMAKING_ROOM_CREATED', {
        queueKey,
        matchId: game.matchId,
        userId: userIdStr,
        variant: normalizedVariant,
        entryFee: fee
      });
      console.log('QUEUE_AFTER_JOIN', {
        queueKey,
        queueLength: freshQueue.length,
        waitingRoomIds: freshQueue.map(item => item.game.matchId)
      });

      const refundTimeout = setTimeout(async () => {
        try {
          if (game.status === 'MATCHMAKING') {
            game.status = 'CANCELLED';
            const q = global.__matchmakingQueue.get(queueKey) || [];
            const qIdx = q.findIndex(i => i.user._id.toString() === userIdStr);
            if (qIdx !== -1) {
              q.splice(qIdx, 1);
              if (q.length === 0) global.__matchmakingQueue.delete(queueKey);
              else global.__matchmakingQueue.set(queueKey, q);
              broadcastLudoQueueUpdate(queueKey);
            }
          }
          if (user.depositBalance >= fee) {
            user.depositBalance += fee;
          } else {
            user.winningsBalance = Math.max(0, user.winningsBalance + fee);
          }
          user.walletBalance = Math.max(0, user.walletBalance + fee);
          try {
            await user.save();
          } catch (err) {
            console.warn('Refund save failed', err);
          }
          try {
            const { addTransaction } = await import('../wallet/transaction.service.js');
            addTransaction({ type: 'REFUND', amount: fee, method: `Matchmaking Refund (${normalizedVariant})` }, user);
          } catch (err) {
            console.warn('Refund txn failed', err);
          }

          console.log('MATCHMAKING_REFUND_ISSUED', { user: userIdStr, fee, matchId: game.matchId });
        } catch (err) {
          console.error('Error in refund timeout', err);
        }
      }, 75000);

      global.__matchmakingRefunds.set(game.matchId, refundTimeout);

      return {
        ...game,
        status: 'MATCHMAKING'
      };
    });
  }

  static getGame(id) {
    return getLudoRoom(id);
  }
  static roll(id, user) {
    const game = getLudoRoom(id);
    if (!game) throw new Error("Game not found.");
    if (game.status === 'FINISHED') throw new Error("Game has already concluded.");
    if (game.diceHasRolled) throw new Error("You already rolled standard dice.");

    const roll = rollDice();
    game.diceRoll = roll;
    game.diceHasRolled = true;
    game.logs.unshift(`${game.turn === 'red' ? 'You' : 'Opponent'} rolled a ${roll}!`);
    game.turnTimerRemaining = 18;

    const hasMoves = hasAnyPlayableMoves(game.tokens, game.turn, roll);
    if (!hasMoves) {
      game.logs.unshift(`No playable moves for ${game.turn === 'red' ? 'You' : 'Opponent'}. Turn switches!`);
      game.diceHasRolled = false;
      game.diceRoll = null;
      game.turn = game.turn === 'red' ? 'yellow' : 'red';
      game.turnTimerRemaining = 18;
      if (game.variant === 'TURN') game.movesRemaining -= 1;
    }
    broadcastGameUpdate(game);
    return game;
  } static async move(id, user, tokenId) {
    const game = getLudoRoom(id);
    if (!game) throw new Error("Game not found.");
    if (!game.diceHasRolled || game.diceRoll === null) throw new Error("Please roll the dice first.");

    const tok = game.tokens.find(t => t.id === tokenId);
    if (!tok) throw new Error("Token not found.");
    if (tok.color !== game.turn) throw new Error("It is not your token to move.");

    const roll = game.diceRoll;
    if (!canTokenMove(tok, roll)) {
      throw new Error("Invalid move: overshoot or base escape without a 6.");
    }

    moveToken(tok, roll);
    game.logs.unshift(`${tok.color === 'red' ? 'You' : 'Opponent'} moved token to position ${tok.position}.`);

    game.turnTimerRemaining = 18;

    if (!game.scores) game.scores = { red: 0, yellow: 0 };
    game.scores.red = calculatePlayerScore(game, 'red');
    game.scores.yellow = calculatePlayerScore(game, 'yellow');
    console.log('SCORE_UPDATED', game.scores);

    // Home scoring log (scores are authoritative from token progress)
    if (tok.position === 57 && tok.prevPosition < 57) {
      game.logs.unshift(`🏠 Home! ${tok.color === 'red' ? 'You' : 'Opponent'} reached the home center!`);
    }

    const captured = evaluateCaptures(game, tok);

    // Recalculate in case of captures
    game.scores.red = calculatePlayerScore(game, 'red');
    game.scores.yellow = calculatePlayerScore(game, 'yellow');

    const isWin = hasAllTokensReachedHome(game.tokens, tok.color);

    if (isWin) {
      game.logs.unshift(`👑 ${tok.color === 'red' ? 'You' : 'Opponent'} achieved ultimate Victory!`);
      await finishGameAndAward(game, tok.color);
      broadcastGameUpdate(game);
      return game;
    }

    switchTurn(game, roll, captured);

    // Ensure dice flags are reset for the next player (defensive - switchTurn should handle this)
    try {
      game.diceHasRolled = false;
      game.diceRoll = null;
    } catch (err) {
      console.warn('Failed resetting dice flags after switchTurn', err);
    }

    if (game.variant === 'TURN') {
      game.movesRemaining -= 1;
      if (game.movesRemaining <= 0) {
        const winnerColor = evaluateWinnerByScore(game);
        await finishGameAndAward(game, winnerColor);
        const redScore = game.scores?.red || 0;
        const yellowScore = game.scores?.yellow || 0;
        game.logs.unshift(`Turns dry! Score counts: Red:${redScore} Yellow:${yellowScore}`);
      }
    }
    broadcastGameUpdate(game);
    return game;
  }

  static async timeout(id, user) {
    const game = getLudoRoom(id);
    if (!game) throw new Error("Game not found.");
    if (game.status === 'FINISHED') throw new Error("Game has already concluded.");

    const timingColor = game.turn;
    game.logs.unshift(`⏰ Timeout! ${timingColor === 'red' ? 'You' : 'Opponent'} missed their turn limit (18s).`);

    if (timingColor === 'red') {
      game.redLives = Math.max(0, game.redLives - 1);
      if (game.redLives <= 0) {
        game.logs.unshift(`💔 3 Lives lost! Red lost by timeout.`);
        await finishGameAndAward(game, 'yellow');
        broadcastGameUpdate(game);
        return game;
      }
    } else {
      game.yellowLives = Math.max(0, game.yellowLives - 1);
      if (game.yellowLives <= 0) {
        game.logs.unshift(`🎉 Opponent lost 3 lives! Red won by opponent timeout!`);
        await finishGameAndAward(game, 'red');
        broadcastGameUpdate(game);
        return game;
      }
    }

    game.diceHasRolled = false;
    game.diceRoll = null;
    game.turn = game.turn === 'red' ? 'yellow' : 'red';

    if (game.variant === 'TURN') {
      game.movesRemaining -= 1;
      if (game.movesRemaining <= 0) {
        const winnerColor = evaluateWinnerByScore(game);
        await finishGameAndAward(game, winnerColor);
        const redScore = game.scores?.red || 0;
        const yellowScore = game.scores?.yellow || 0;
        game.logs.unshift(`Turns Dry! RedScore:${redScore} vs YellowScore:${yellowScore}`);
      }
    }
    broadcastGameUpdate(game);
    return game;
  }

  static async endTimeMode(id, user) {
    const game = getLudoRoom(id);
    if (!game) throw new Error("Game not found.");
    if (game.status === 'FINISHED') throw new Error("Game already finished.");

    const winnerColor = evaluateWinnerByScore(game);
    await finishGameAndAward(game, winnerColor);

    const redScore = game.scores?.red || 0;
    const yellowScore = game.scores?.yellow || 0;
    game.logs.unshift(`⏱️ Time's up! points tally: Red: ${redScore} | Yellow: ${yellowScore}`);

    // Broadcast full update and emit final events if namespace available
    broadcastGameUpdate(game);
    try {
      if (global.ludoNamespace) {
        global.ludoNamespace.to(game.matchId).emit('GAME_ENDED', { roomId: game.matchId, winner: winnerColor });
        global.ludoNamespace.to(game.matchId).emit('WINNER_DECLARED', { winner: winnerColor, prize: game.winningPrize, roomId: game.matchId });
      }
    } catch (err) {
      console.warn('Failed to emit GAME_ENDED/WINNER_DECLARED in endTimeMode', err);
    }

    return game;
  }

  static async leave(id, user) {
    const game = getLudoRoom(id);
    if (!game) throw new Error("Game not found.");
    if (game.status === 'FINISHED') throw new Error("Game already finished.");

    const color = game.players.red.userId.toString() === user._id.toString() ? 'red' : 'yellow';
    const opponentColor = color === 'red' ? 'yellow' : 'red';

    game.logs.unshift(`🚪 Player ${color === 'red' ? 'You' : 'Opponent'} folded/left.`);
    await finishGameAndAward(game, opponentColor);
    broadcastGameUpdate(game);
    return game;
  }

  static async cancelMatchmaking(user) {
    if (!global.__matchmakingQueue) {
      global.__matchmakingQueue = new Map();
    }
    const userIdStr = user._id.toString();
    console.log("CANCEL_MATCHMAKING_REQUEST", userIdStr);

    for (const [queueKey, queue] of global.__matchmakingQueue.entries()) {
      const idx = queue.findIndex(item => item.user._id.toString() === userIdStr);
      if (idx !== -1) {
        const item = queue[idx];
        const matchId = item.game.matchId;

        // Remove from queue
        queue.splice(idx, 1);
        if (queue.length === 0) {
          global.__matchmakingQueue.delete(queueKey);
        } else {
          global.__matchmakingQueue.set(queueKey, queue);
        }
        broadcastLudoQueueUpdate(queueKey);

        // Clear refund timeout
        const refundTimer = global.__matchmakingRefunds.get(matchId);
        if (refundTimer) {
          clearTimeout(refundTimer);
          global.__matchmakingRefunds.delete(matchId);
        }

        // Delete the room from in-memory DB to prevent ghost matchmaking
        db.ludoGames.delete(matchId);

        // Refund user immediately
        user.walletBalance = (user.walletBalance || 0) + fee;
        user.depositBalance = (user.depositBalance || 0) + fee;
        await user.save();

        // Record transaction
        try {
          const { addTransaction } = await import('../wallet/transaction.service.js');
          addTransaction({ type: 'REFUND', amount: fee, status: 'SUCCESS', method: `Matchmaking Cancelled` }, user);
        } catch (err) {
          console.warn('Failed to add transaction for matchmaking cancellation refund', err);
        }

        console.log("MATCHMAKING_CANCELLED_SUCCESS", userIdStr, "Match ID:", matchId, "Refunded:", fee);
        return { success: true, refunded: fee };
      }
    }

    return { success: false, message: "User not in matchmaking queue." };
  }
}
