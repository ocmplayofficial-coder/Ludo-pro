import { db } from '../config/db.js';
import { evaluateTeenPattiHand, compareHands } from '../game-engine/teenpatti/winnerEngine.js';
import { addTransaction } from '../wallet/transaction.service.js';
import { UserModel } from '../models/user.model.js';
import { TeenPattiMatchModel } from '../models/teenpattiMatch.model.js';
import { buildDeck } from '../game-engine/teenpatti/deckManager.js';
import { shuffleDeck } from '../game-engine/teenpatti/cardShuffler.js';

// Timer storage for game intervals
if (!global.__tpGameIntervals) {
  global.__tpGameIntervals = new Map();
}

function broadcastTPGameUpdate(game) {
  if (global.teenpattiNamespace) {
    console.log("SOCKET_BROADCAST_TP_GAME_UPDATE", game.matchId);
    global.teenpattiNamespace.to(game.matchId).emit('GAME_UPDATE', game);
  }
}

export class TeenPattiService {

  static startTPGameTimer(matchId) {
    if (global.__tpGameIntervals.has(matchId)) {
      clearInterval(global.__tpGameIntervals.get(matchId));
    }

    const intervalId = setInterval(async () => {
      try {
        const game = db.teenPattiGames.get(matchId);
        if (!game || game.status !== 'PLAYING') {
          clearInterval(intervalId);
          global.__tpGameIntervals.delete(matchId);
          return;
        }

        game.turnTimerRemaining = (game.turnTimerRemaining || 15) - 1;
        if (game.turnTimerRemaining <= 0) {
          console.log(`[TP-Timer] Timeout turn occurred for game ${matchId}`);
          await TeenPattiService.handleTimeoutFold(matchId, game.turn);
        } else {
          broadcastTPGameUpdate(game);
        }
      } catch (err) {
        console.error(`Error in TP game timer loop:`, err);
      }
    }, 1000);

    global.__tpGameIntervals.set(matchId, intervalId);
  }

  static async matchmaking(user, variant, entryFee) {
    if (!global.__tpQueue) {
      global.__tpQueue = new Map();
    }
    if (!global.__tpRefunds) {
      global.__tpRefunds = new Map();
    }
    const queueKey = `${entryFee}:${variant}`;
    const userIdStr = user._id.toString();

    console.log("TP_MATCHMAKING_REQUEST", user.username, variant, entryFee);

    const fee = parseFloat(entryFee);
    if (user.walletBalance < fee) throw new Error('Insufficient wallet balance.');

    // Deduct entry fee
    if (user.depositBalance >= fee) {
      user.depositBalance -= fee;
    } else {
      const rest = fee - user.depositBalance;
      user.depositBalance = 0;
      user.winningsBalance = Math.max(0, user.winningsBalance - rest);
    }
    user.walletBalance = Math.max(0, user.walletBalance - fee);
    await user.save();

    // Record transaction
    try {
      addTransaction({
        type: 'ENTRY_FEE',
        amount: fee,
        status: 'SUCCESS',
        method: `TeenPatti Matchmaking (${variant})`
      }, user);
    } catch (err) {
      console.warn('Failed to record TP matchmaking transaction', err);
    }

    // 1. Check if user already in the same queue
    const sameQueue = global.__tpQueue.get(queueKey) || [];
    const existingIndex = sameQueue.findIndex(item => item.user._id.toString() === userIdStr);
    if (existingIndex !== -1) {
      return { ...sameQueue[existingIndex].game, status: 'MATCHMAKING' };
    }

    // 2. Queue cleanup from other queues
    for (const [k, q] of global.__tpQueue.entries()) {
      if (k !== queueKey) {
        const idx = q.findIndex(item => item.user._id.toString() === userIdStr);
        if (idx !== -1) {
          q.splice(idx, 1);
        if (q.length === 0) {
          global.__tpQueue.delete(k);
        } else {
          global.__tpQueue.set(k, q);
        }
        broadcastTPQueueUpdate(k);
        }
      }
    }

    // 3. Find a waiting opponent in this queue
    const queue = global.__tpQueue.get(queueKey) || [];
    let waitingIndex = queue.findIndex(item => item.user._id.toString() !== userIdStr);

    if (waitingIndex !== -1) {
      const waiting = queue[waitingIndex];
      queue.splice(waitingIndex, 1);
      if (queue.length === 0) {
        global.__tpQueue.delete(queueKey);
      } else {
        global.__tpQueue.set(queueKey, queue);
      }
      broadcastTPQueueUpdate(queueKey);

      // Clear refund timer for matched opponent
      const timerKey = waiting.game.matchId;
      const tId = global.__tpRefunds.get(timerKey);
      if (tId) {
        clearTimeout(tId);
        global.__tpRefunds.delete(timerKey);
      }

      // Match found! Initialize table with 2 seats
      const matchId = waiting.game.matchId;
      const deck = shuffleDeck(buildDeck());

      let jokerValue = null;
      if (variant === 'JOKER') {
        const randomCard = deck[Math.floor(Math.random() * deck.length)];
        jokerValue = randomCard.value;
      }

      const handA = [deck.pop(), deck.pop(), deck.pop()];
      const handB = [deck.pop(), deck.pop(), deck.pop()];

      const game = {
        matchId,
        variant,
        entryFee: fee,
        jokerValue,
        pot: fee * 2,
        currentBet: fee,
        players: {
          A: {
            userId: waiting.user._id.toString(),
            username: waiting.user.username,
            avatar: waiting.user.avatar,
            walletBalance: waiting.user.walletBalance,
            cards: handA,
            seen: false,
            folded: false,
            lastBet: fee
          },
          B: {
            userId: user._id.toString(),
            username: user.username,
            avatar: user.avatar,
            walletBalance: user.walletBalance,
            cards: handB,
            seen: false,
            folded: false,
            lastBet: fee
          }
        },
        turn: waiting.user._id.toString(),
        turnTimerRemaining: 15,
        winner: null,
        status: 'PLAYING_PENDING',
        waitingForPlayers: true,
        logs: [
          `Table matched!`,
          `Ante values of ₹${fee} placed by both players.`,
          `Cards dealt. First turn goes to ${waiting.user.username}.`
        ]
      };

      db.teenPattiGames.set(matchId, game);

      if (global.teenpattiNamespace) {
        global.teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      }

      return game;
    }

    // 4. Create new matchmaking room
    const matchId = "TP-" + Math.floor(100000 + Math.random() * 900000);
    const game = {
      matchId,
      variant,
      entryFee: fee,
      pot: fee,
      players: {
        A: {
          userId: user._id.toString(),
          username: user.username,
          avatar: user.avatar,
          walletBalance: user.walletBalance,
          cards: [],
          seen: false,
          folded: false,
          lastBet: fee
        }
      },
      status: 'MATCHMAKING'
    };

    const freshQueue = global.__tpQueue.get(queueKey) || [];
    freshQueue.push({ user, game });
    global.__tpQueue.set(queueKey, freshQueue);
    broadcastTPQueueUpdate(queueKey);

    // Refund timeout
    const refundTimeout = setTimeout(async () => {
      try {
        const q = global.__tpQueue.get(queueKey) || [];
        const idx = q.findIndex(item => item.user._id.toString() === userIdStr && item.game.matchId === matchId);
        if (idx !== -1) {
          q.splice(idx, 1);
          if (q.length === 0) {
            global.__tpQueue.delete(queueKey);
          } else {
            global.__tpQueue.set(queueKey, q);
          }
          broadcastTPQueueUpdate(queueKey);

          // Refund user
          const u = await UserModel.findById(userIdStr);
          if (u) {
            u.walletBalance = (u.walletBalance || 0) + fee;
            u.depositBalance = (u.depositBalance || 0) + fee;
            await u.save();
            addTransaction({
              type: 'REFUND',
              amount: fee,
              status: 'SUCCESS',
              method: `TeenPatti Draw Refund`
            }, u);
          }
          db.teenPattiGames.delete(matchId);
          console.log('TP_MATCHMAKING_REFUND_ISSUED', { userIdStr, matchId });
        }
      } catch (err) {
        console.error('Error in TP refund timeout:', err);
      }
    }, 75000);

    global.__tpRefunds.set(matchId, refundTimeout);

    return game;
  }

  static getGame(id) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Teen Patti room not found.");
    return game;
  }

  static async cancelMatchmaking(user) {
    if (!global.__tpQueue) return { success: false, message: "No active queue." };
    const userIdStr = user._id.toString();

    for (const [queueKey, queue] of global.__tpQueue.entries()) {
      const idx = queue.findIndex(item => item.user._id.toString() === userIdStr);
      if (idx !== -1) {
        const item = queue[idx];
        const fee = item.game.entryFee;
        const matchId = item.game.matchId;

        queue.splice(idx, 1);
        if (queue.length === 0) {
          global.__tpQueue.delete(queueKey);
        } else {
          global.__tpQueue.set(queueKey, queue);
        }
        broadcastTPQueueUpdate(queueKey);

        const refundTimer = global.__tpRefunds.get(matchId);
        if (refundTimer) {
          clearTimeout(refundTimer);
          global.__tpRefunds.delete(matchId);
        }

        db.teenPattiGames.delete(matchId);

        user.walletBalance = (user.walletBalance || 0) + fee;
        user.depositBalance = (user.depositBalance || 0) + fee;
        await user.save();

        addTransaction({
          type: 'REFUND',
          amount: fee,
          status: 'SUCCESS',
          method: `TeenPatti Match Cancelled`
        }, user);

        return { success: true, refunded: fee };
      }
    }
    return { success: false, message: "User not in matchmaking queue." };
  }

  static async handleTimeoutFold(matchId, currentTurnUserId) {
    const game = db.teenPattiGames.get(matchId);
    if (!game || game.status !== 'PLAYING') return;

    game.logs.unshift(`⏰ Timeout! Player turn expired.`);
    await TeenPattiService.concludeFold(game, currentTurnUserId);
  }

  static async fold(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Game has already concluded.");

    const userIdStr = user._id.toString();
    if (game.turn !== userIdStr) throw new Error("It is not your turn.");

    await TeenPattiService.concludeFold(game, userIdStr);
    return game;
  }

  static async concludeFold(game, foldingUserId) {
    const isPlayerAFolding = game.players.A.userId === foldingUserId;
    const folder = isPlayerAFolding ? game.players.A : game.players.B;
    const winner = isPlayerAFolding ? game.players.B : game.players.A;

    folder.folded = true;
    game.logs.unshift(`🏳️ ${folder.username} Folded!`);

    await TeenPattiService.awardWinner(game, winner);
  }

  static seen(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Game is not active.");

    const isPlayerA = game.players.A.userId === user._id.toString();
    const player = isPlayerA ? game.players.A : game.players.B;

    if (player.seen) return game;

    player.seen = true;
    game.logs.unshift(`👀 ${player.username} has seen their cards!`);
    broadcastTPGameUpdate(game);
    return game;
  }

  static async chaal(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Game is not active.");

    const userIdStr = user._id.toString();
    if (game.turn !== userIdStr) throw new Error("It is not your turn.");

    const isPlayerA = game.players.A.userId === userIdStr;
    const player = isPlayerA ? game.players.A : game.players.B;
    const opponent = isPlayerA ? game.players.B : game.players.A;

    // Bet size matches: seen player plays double
    const betSize = player.seen ? game.currentBet * 2 : game.currentBet;

    const u = await UserModel.findById(userIdStr);
    if (u.walletBalance < betSize) {
      throw new Error("Insufficient wallet balance for this Chaal.");
    }

    // Deduct
    if (u.depositBalance >= betSize) {
      u.depositBalance -= betSize;
    } else {
      const rest = betSize - u.depositBalance;
      u.depositBalance = 0;
      u.winningsBalance = Math.max(0, u.winningsBalance - rest);
    }
    u.walletBalance = Math.max(0, u.walletBalance - betSize);
    await u.save();

    player.walletBalance = u.walletBalance;
    player.lastBet = betSize;
    game.pot += betSize;
    game.logs.unshift(`🎲 ${player.username} played Chaal: ₹${betSize}`);

    // Switch turn
    game.turn = opponent.userId;
    game.turnTimerRemaining = 15;

    broadcastTPGameUpdate(game);
    return game;
  }

  static async show(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Game is not active.");

    const userIdStr = user._id.toString();
    if (game.turn !== userIdStr) throw new Error("It is not your turn.");

    const isPlayerA = game.players.A.userId === userIdStr;
    const player = isPlayerA ? game.players.A : game.players.B;
    const opponent = isPlayerA ? game.players.B : game.players.A;

    const betSize = player.seen ? game.currentBet * 2 : game.currentBet;

    const u = await UserModel.findById(userIdStr);
    if (u.walletBalance < betSize) {
      throw new Error("Insufficient wallet balance for Show.");
    }

    // Deduct
    if (u.depositBalance >= betSize) {
      u.depositBalance -= betSize;
    } else {
      const rest = betSize - u.depositBalance;
      u.depositBalance = 0;
      u.winningsBalance = Math.max(0, u.winningsBalance - rest);
    }
    u.walletBalance = Math.max(0, u.walletBalance - betSize);
    await u.save();

    player.walletBalance = u.walletBalance;
    player.lastBet = betSize;
    game.pot += betSize;
    game.logs.unshift(`🏁 ${player.username} called SHOWDOWN!`);

    // Compare hands
    const winRef = compareHands(game.players.A.cards, game.players.B.cards, game.variant, game.jokerValue);
    const winner = winRef === 'A' ? game.players.A : game.players.B;

    await TeenPattiService.awardWinner(game, winner);
    return game;
  }

  static async awardWinner(game, winnerSeat) {
    game.winner = winnerSeat.userId === game.players.A.userId ? 'A' : 'B';
    game.status = 'FINISHED';

    // Clear timer
    if (global.__tpGameIntervals.has(game.matchId)) {
      clearInterval(global.__tpGameIntervals.get(game.matchId));
      global.__tpGameIntervals.delete(game.matchId);
    }

    try {
      const winnerUser = await UserModel.findById(winnerSeat.userId);
      const loserSeat = winnerSeat.userId === game.players.A.userId ? game.players.B : game.players.A;
      const loserUser = await UserModel.findById(loserSeat.userId);

      // Pot award
      if (winnerUser) {
        winnerUser.walletBalance = (winnerUser.walletBalance || 0) + game.pot;
        winnerUser.winningsBalance = (winnerUser.winningsBalance || 0) + game.pot;
        winnerUser.wins += 1;
        winnerUser.gamesPlayed += 1;
        winnerUser.earnings += game.pot;
        await winnerUser.save();

        addTransaction({
          type: "WINNINGS",
          amount: game.pot,
          status: "SUCCESS",
          method: `TeenPatti Win (${game.variant})`
        }, winnerUser);
      }

      if (loserUser) {
        loserUser.gamesPlayed += 1;
        await loserUser.save();
      }

      // Save match to database Match History
      const matchHistory = await TeenPattiMatchModel.create({
        matchId: game.matchId,
        variant: game.variant,
        entryFee: game.entryFee,
        pot: game.pot,
        players: [
          {
            userId: game.players.A.userId,
            username: game.players.A.username,
            avatar: game.players.A.avatar,
            cards: game.players.A.cards,
            folded: game.players.A.folded,
            seen: game.players.A.seen,
            winnings: winnerSeat.userId === game.players.A.userId ? game.pot : 0
          },
          {
            userId: game.players.B.userId,
            username: game.players.B.username,
            avatar: game.players.B.avatar,
            cards: game.players.B.cards,
            folded: game.players.B.folded,
            seen: game.players.B.seen,
            winnings: winnerSeat.userId === game.players.B.userId ? game.pot : 0
          }
        ],
        winnerId: winnerSeat.userId,
        winnerName: winnerSeat.username
      });

      console.log("MATCH_HISTORY_SAVED", matchHistory.matchId);

      game.logs.unshift(`👑 Winner declared: ${winnerSeat.username} claimed the pot of ₹${game.pot}!`);

      if (global.teenpattiNamespace) {
        global.teenpattiNamespace.to(game.matchId).emit('WINNER_DECLARED', {
          winner: game.winner,
          winnerName: winnerSeat.username,
          pot: game.pot,
          players: game.players,
          matchId: game.matchId
        });
      }
    } catch (err) {
      console.error("Error declaring/awarding Teen Patti winner:", err);
    }

    broadcastTPGameUpdate(game);
  }

  static async leave(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status === 'FINISHED') return game;

    const userIdStr = user._id.toString();
    const isPlayerA = game.players.A.userId === userIdStr;
    const opponent = isPlayerA ? game.players.B : game.players.A;

    game.logs.unshift(`🚪 Player left the table.`);
    await TeenPattiService.awardWinner(game, opponent);

    return game;
  }
}
