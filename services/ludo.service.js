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
import { LudoMatchModel } from '../models/ludoMatch.model.js';
import { db } from '../config/db.js';
import { StatsService } from './stats.service.js';
import { ArenaStatusManager } from '../game-engine/ludo/ArenaStatusManager.js';

function normalizeMatchmakingQueueKey(entryFee, variant) {
  const fee = Number(entryFee);
  const normalizedFee = Number.isFinite(fee) ? fee : entryFee;
  const normalizedVariant = String(variant || '').toUpperCase().trim();
  return `${normalizedFee}:${normalizedVariant}`;
}

function broadcastLudoQueueUpdate(queueKey) {
  if (global.ludoNamespace) {
    const q = global.__matchmakingQueue?.get(queueKey);
    ArenaStatusManager.syncState(queueKey, q);
  }
}

function isUserInAnyGameOrQueue(userIdStr) {
  // 1. Check all matchmaking queues
  if (global.__matchmakingQueue) {
    for (const [key, queue] of global.__matchmakingQueue.entries()) {
      if (queue.some(item => item.user._id.toString() === userIdStr)) {
        return true;
      }
    }
  }

  // 2. Check all active/pending games
  if (db.ludoGames) {
    for (const game of db.ludoGames.values()) {
      if (game.status === 'FINISHED' || game.status === 'CANCELLED') continue;
      const redId = game.players?.red?.userId?.toString();
      const yellowId = game.players?.yellow?.userId?.toString();
      if (redId === userIdStr || yellowId === userIdStr) {
        return true;
      }
    }
  }

  return false;
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

  // Delete from in-memory map when finished
  db.ludoGames.delete(game.matchId);
  const queueKey = `${game.entryFee}:${game.variant}`;
  broadcastLudoQueueUpdate(queueKey);
  ArenaStatusManager.leavePool(queueKey);
  
  if (global.io) {
    StatsService.emitStatsUpdate(global.io).catch(err => console.error('STATS_EMIT_ERROR', err));
  }

  try {
    const redPlayerId = game.players.red.userId;
    const yellowPlayerId = game.players.yellow?.userId;

    const redUser = await UserModel.findById(redPlayerId);
    const yellowUser = yellowPlayerId ? await UserModel.findById(yellowPlayerId) : null;

    let winnerId = null;
    if (winnerColor === 'red' && redUser) winnerId = redUser._id;
    if (winnerColor === 'yellow' && yellowUser) winnerId = yellowUser._id;

    try {
      if (yellowPlayerId) { // Only save if there's actually a second player
        await LudoMatchModel.create({
          matchId: game.matchId,
          variant: game.variant,
          entryFee: game.entryFee,
          winningPrize: game.winningPrize,
          players: {
            red: {
              userId: redPlayerId,
              username: game.players.red.username,
              avatar: game.players.red.avatar,
              color: 'red',
              score: game.scores?.red || 0
            },
            yellow: {
              userId: yellowPlayerId,
              username: game.players.yellow.username,
              avatar: game.players.yellow.avatar,
              color: 'yellow',
              score: game.scores?.yellow || 0
            }
          },
          winnerId,
          winnerColor,
          status: 'FINISHED'
        });
        console.log('Saved LudoMatch to DB', game.matchId);
      }
    } catch (dbErr) {
      console.error('Failed to save LudoMatch to DB', dbErr);
    }

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

    console.log('[MM] MATCHMAKING_ENTER', {
      username: user.username,
      userId: userIdStr,
      variant: normalizedVariant,
      entryFee: fee,
      queueKey,
    });

    if (!Number.isFinite(fee) || fee <= 0) {
      throw new Error('Invalid entry fee.');
    }

    return await withMatchmakingLock(queueKey, async () => {
      // 1. Strict duplicate check (Spam Protection)
      // Must happen inside lock to prevent race conditions during duplicate joins
      if (isUserInAnyGameOrQueue(userIdStr)) {
        console.log('[MM] SPAM_PROTECTION_REJECT', { userId: userIdStr, queueKey });
        
        // If they are in the queue, return their pending game
        const queue = global.__matchmakingQueue.get(queueKey) || [];
        const existingItem = queue.find(item => item.user._id.toString() === userIdStr);
        if (existingItem) {
           return { ...existingItem.game, status: 'MATCHMAKING' };
        }
        
        // If they are in an active game, throw so frontend ignores
        throw new Error("You are already in a match or queue.");
      }

      // 2. Deduct Fee
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
        console.warn('[MM] Failed to persist user balance after matchmaking deduction', err);
      }

      try {
        const { addTransaction } = await import('../wallet/transaction.service.js');
        addTransaction({ type: 'ENTRY_FEE', amount: fee, method: `Ludo Matchmaking (${normalizedVariant})` }, user);
      } catch (err) {
        console.warn('[MM] Failed to record matchmaking transaction', err);
      }

      // Always read fresh from the Map inside the lock
      const queue = global.__matchmakingQueue.get(queueKey) || [];

      console.log('[MM] LOCK_ACQUIRED', {
        queueKey,
        userId: userIdStr,
        QUEUE_LENGTH: queue.length,
        waitingIds: queue.map(i => i.user._id.toString()),
      });

      // -------------------------------------------------------
      // MATCH: find another user waiting in this queue
      // -------------------------------------------------------
      const waitingIndex = queue.findIndex(item => item.user._id.toString() !== userIdStr);
      if (waitingIndex !== -1) {
        const opponentItem = queue[waitingIndex];

        // Remove opponent from queue BEFORE any async work
        queue.splice(waitingIndex, 1);
        if (queue.length === 0) {
          global.__matchmakingQueue.delete(queueKey);
        } else {
          global.__matchmakingQueue.set(queueKey, queue);
        }

        console.log('[MM] PLAYER_REMOVED from queue', {
          queueKey,
          removedUserId: opponentItem.user._id.toString(),
          QUEUE_LENGTH_AFTER: queue.length,
        });

        const game = opponentItem.game;

        // Assign joiner as yellow
        game.players.yellow = {
          userId: user._id,
          username: user.username,
          avatar: user.avatar,
          color: 'yellow'
        };
        game.status = 'PLAYING_PENDING';

        // Clear 75s auto-refund timeout for opponent's slot
        const refundTimer = global.__matchmakingRefunds.get(game.matchId);
        if (refundTimer) {
          clearTimeout(refundTimer);
          global.__matchmakingRefunds.delete(game.matchId);
        }

        // Setup 20-second connection timeout to protect against ghost matches
        const connectionTimeout = setTimeout(async () => {
          try {
            await LudoService.abortPendingMatch(game.matchId, 'Players failed to connect in time', queueKey, fee);
          } catch (e) {
            console.error('[MM] Connection timeout error', e);
          }
        }, 20000);
        
        global.__matchmakingRefunds.set(game.matchId, connectionTimeout); // Reusing the same map for the connection timeout is fine as the 75s one was cleared

        // Sync queue display and increment playing counters
        broadcastLudoQueueUpdate(queueKey);
        ArenaStatusManager.joinPool(queueKey);

        if (global.io) {
          StatsService.emitStatsUpdate(global.io).catch(err => console.error('[MM] STATS_EMIT_ERROR', err));
        }

        console.log('[MM] PAIR_CREATED', {
          queueKey,
          ROOM_ID: game.matchId,
          red: opponentItem.user._id.toString(),
          yellow: userIdStr,
          WAITING_COUNT: queue.length,
          PLAYING_COUNT: ArenaStatusManager.state[queueKey]?.playingCount ?? '?',
          ACTIVE_MATCHES: ArenaStatusManager.state[queueKey]?.activeMatchCount ?? '?',
        });

        // Notify BOTH players via socket so neither misses MATCH_FOUND
        if (global.ludoNamespace) {
          // Notify the waiting player (red / opponent)
          const redSocketId = global.onlineUsers.get(opponentItem.user._id.toString());
          if (redSocketId) {
            const redSocket = global.ludoNamespace.sockets.get(redSocketId);
            if (redSocket) {
              redSocket.emit('MATCH_FOUND', { roomId: game.matchId, players: game.players });
              redSocket.emit('GAME_UPDATE', game);
              console.log('[MM] MATCH_FOUND emitted to red (waiting player)', { socketId: redSocketId, matchId: game.matchId });
            }
          }

          // Notify the joining player (yellow / D) via their personal socket room
          const yellowSocketId = global.onlineUsers.get(userIdStr);
          if (yellowSocketId) {
            const yellowSocket = global.ludoNamespace.sockets.get(yellowSocketId);
            if (yellowSocket) {
              yellowSocket.emit('MATCH_FOUND', { roomId: game.matchId, players: game.players });
              yellowSocket.emit('GAME_UPDATE', game);
              console.log('[MM] MATCH_FOUND emitted to yellow (joining player)', { socketId: yellowSocketId, matchId: game.matchId });
            }
          }
        }

        console.log('[MM] ROOM_CREATED (match from queue)', { ROOM_ID: game.matchId, queueKey });
        console.log('[MM] QUEUE_AFTER_MATCH', {
          queueKey,
          QUEUE_LENGTH: global.__matchmakingQueue.get(queueKey)?.length ?? 0,
        });
        console.log('[MM] LOCK_RELEASED (match made)');

        // Return PLAYING_PENDING so frontend knows the match is found
        return { ...game, status: 'PLAYING_PENDING' };
      }

      // -------------------------------------------------------
      // WAIT: no opponent found — create a new room and wait
      // -------------------------------------------------------
      const game = createLudoRoom(user, normalizedVariant, fee);

      // Re-read queue from map to avoid stale reference after any prior mutations
      const freshQueue = global.__matchmakingQueue.get(queueKey) || [];
      freshQueue.push({ user, game });
      global.__matchmakingQueue.set(queueKey, freshQueue);
      broadcastLudoQueueUpdate(queueKey);

      if (global.io) {
        StatsService.emitStatsUpdate(global.io).catch(err => console.error('[MM] STATS_EMIT_ERROR', err));
      }

      console.log('[MM] ROOM_CREATED (waiting for opponent)', {
        ROOM_ID: game.matchId,
        queueKey,
        userId: userIdStr,
        QUEUE_LENGTH: freshQueue.length,
        WAITING_COUNT: freshQueue.length,
        ACTIVE_MATCHES: ArenaStatusManager.state[queueKey]?.activeMatchCount ?? 0,
      });

      // Auto-refund if no opponent found within 75 seconds
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
            console.warn('[MM] Refund save failed', err);
          }
          try {
            const { addTransaction } = await import('../wallet/transaction.service.js');
            addTransaction({ type: 'REFUND', amount: fee, method: `Matchmaking Refund (${normalizedVariant})` }, user);
          } catch (err) {
            console.warn('[MM] Refund txn failed', err);
          }

          console.log('[MM] MATCHMAKING_REFUND_ISSUED', { userId: userIdStr, fee, matchId: game.matchId });
        } catch (err) {
          console.error('[MM] Error in refund timeout', err);
        }
      }, 75000);

      global.__matchmakingRefunds.set(game.matchId, refundTimeout);

      console.log('[MM] LOCK_RELEASED (waiting for opponent)');

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
    const reachedHome = (tok.position === 57 && tok.prevPosition < 57);
    if (reachedHome) {
      game.logs.unshift(`🏠 Home! ${tok.color === 'red' ? 'You' : 'Opponent'} reached the home center!`);
      if (!game.bonusScore) game.bonusScore = { red: 0, yellow: 0 };
      game.bonusScore[tok.color] = (game.bonusScore[tok.color] || 0) + 56;
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

    switchTurn(game, roll, captured, reachedHome);

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
    game.turnTimerRemaining = 18;

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

  static async abortPendingMatch(matchId, reason, queueKey, fee) {
    const checkGame = db.ludoGames.get(matchId);
    if (!checkGame || checkGame.status !== 'PLAYING_PENDING') return;

    console.log('[MM] ABORTING_PENDING_MATCH', { matchId, reason });
    checkGame.status = 'CANCELLED';
    db.ludoGames.delete(matchId);
    
    if (queueKey) {
      ArenaStatusManager.leavePool(queueKey);
    }
    
    if (global.ludoNamespace) {
      global.ludoNamespace.to(matchId).emit('GAME_CANCELLED', { reason });
    }

    // Refund Red
    if (checkGame.players?.red?.userId) {
      const redUser = await UserModel.findById(checkGame.players.red.userId);
      if (redUser) {
        if (redUser.depositBalance >= fee) redUser.depositBalance += fee;
        else redUser.winningsBalance = Math.max(0, (redUser.winningsBalance || 0) + fee);
        redUser.walletBalance = Math.max(0, (redUser.walletBalance || 0) + fee);
        await redUser.save().catch(e => console.warn('Red refund save err', e));
        try {
          const { addTransaction } = await import('../wallet/transaction.service.js');
          addTransaction({ type: 'REFUND', amount: fee, status: 'SUCCESS', method: `Match Aborted` }, redUser);
        } catch(e) {}
      }
    }

    // Refund Yellow
    if (checkGame.players?.yellow?.userId) {
      const yellowUser = await UserModel.findById(checkGame.players.yellow.userId);
      if (yellowUser) {
        if (yellowUser.depositBalance >= fee) yellowUser.depositBalance += fee;
        else yellowUser.winningsBalance = Math.max(0, (yellowUser.winningsBalance || 0) + fee);
        yellowUser.walletBalance = Math.max(0, (yellowUser.walletBalance || 0) + fee);
        await yellowUser.save().catch(e => console.warn('Yellow refund save err', e));
        try {
          const { addTransaction } = await import('../wallet/transaction.service.js');
          addTransaction({ type: 'REFUND', amount: fee, status: 'SUCCESS', method: `Match Aborted` }, yellowUser);
        } catch(e) {}
      }
    }
  }

  static async cancelMatchmaking(user) {
    if (!global.__matchmakingQueue) return { success: false, message: 'No active queue.' };
    
    const userIdStr = user._id.toString();
    console.log("CANCEL_MATCHMAKING_REQUEST", userIdStr);

    for (const [queueKey, queue] of global.__matchmakingQueue.entries()) {
      const idx = queue.findIndex(item => item.user._id.toString() === userIdStr);
      if (idx !== -1) {
        // Enforce lock to prevent race condition during cancel
        return await withMatchmakingLock(queueKey, async () => {
          // Re-find inside lock
          const q = global.__matchmakingQueue.get(queueKey) || [];
          const currentIdx = q.findIndex(item => item.user._id.toString() === userIdStr);
          if (currentIdx === -1) {
             return { success: false, message: 'User already matched or removed.' };
          }
          
          const item = q[currentIdx];
          const fee = Number(item.game.entryFee || 0);
          const matchId = item.game.matchId;

          // 1. Remove from queue
          q.splice(currentIdx, 1);
          if (q.length === 0) {
            global.__matchmakingQueue.delete(queueKey);
          } else {
            global.__matchmakingQueue.set(queueKey, q);
          }
          broadcastLudoQueueUpdate(queueKey);

          // 2. Clear timer
          const refundTimer = global.__matchmakingRefunds.get(matchId);
          if (refundTimer) {
            clearTimeout(refundTimer);
            global.__matchmakingRefunds.delete(matchId);
          }

          // 3. Delete room
          db.ludoGames.delete(matchId);

          if (!Number.isFinite(fee) || fee <= 0) {
            return { success: false, message: 'Invalid matchmaking fee.' };
          }

          // 4. Refund
          if (user.depositBalance >= fee) {
            user.depositBalance += fee;
          } else {
            user.winningsBalance = Math.max(0, (user.winningsBalance || 0) + fee);
          }
          user.walletBalance = Math.max(0, (user.walletBalance || 0) + fee);
          await user.save();

          try {
            const { addTransaction } = await import('../wallet/transaction.service.js');
            addTransaction({ type: 'REFUND', amount: fee, status: 'SUCCESS', method: `Matchmaking Cancelled` }, user);
          } catch (err) {}

          console.log("MATCHMAKING_CANCELLED_SUCCESS", userIdStr, "Match ID:", matchId, "Refunded:", fee);
          return { success: true, refunded: fee };
        });
      }
    }

    return { success: true, message: "Cancellation requested. User was not in queue." };
  }
}
