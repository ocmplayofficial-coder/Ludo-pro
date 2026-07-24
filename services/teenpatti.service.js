import { db } from '../config/db.js';
import { evaluateTeenPattiHand, compareHands } from '../game-engine/teenpatti/winnerEngine.js';
import { addTransaction } from '../wallet/transaction.service.js';
import { UserModel } from '../models/user.model.js';
import { TeenPattiMatchModel } from '../models/teenpattiMatch.model.js';
import { buildDeck } from '../game-engine/teenpatti/deckManager.js';
import { shuffleDeck } from '../game-engine/teenpatti/cardShuffler.js';

if (!global.__tpGameIntervals) global.__tpGameIntervals = new Map();
if (!global.__tpQueue) global.__tpQueue = new Map(); // Maps queueKey to an array of matchIds
if (!global.__tpRefunds) global.__tpRefunds = new Map(); // Matchmaking expiry timeouts

const PLATFORM_COMMISSION = 0.05; // 5%

function broadcastTPQueueUpdate(queueKey) {
  if (global.teenpattiNamespace) {
    let count = 0;
    const [feeStr, variantStr] = queueKey.split(':');
    const fee = Number(feeStr);
    for (const game of db.teenPattiGames.values()) {
      if (game.entryFee === fee && game.variant === variantStr) {
        if (game.players.A) count++;
        if (game.players.B) count++;
      }
    }
    global.teenpattiNamespace.emit('QUEUE_UPDATE', { queueKey, count, gameType: 'teenpatti' });
  }
}

function broadcastTPGameUpdate(game) {
  if (global.teenpattiNamespace) {
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

        // If a side show is pending, we don't tick the turn timer for the main turn, we tick the side show timer?
        // Actually, we can tick the turn timer. If it times out, the active player folds.
        game.turnTimerRemaining = (game.turnTimerRemaining || 15) - 1;
        if (game.turnTimerRemaining <= 0) {
          console.log(`[TP-Timer] Timeout turn occurred for game ${matchId}`);
          
          if (game.sideShow) {
            // Target player timed out rejecting/accepting
            await TeenPattiService.handleSideShowTimeout(game);
          } else {
            await TeenPattiService.handleTimeoutFold(matchId, game.turn);
          }
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
    const queueKey = `${entryFee}:${variant}`;
    const userIdStr = user._id.toString();
    const fee = parseFloat(entryFee);

    if (user.walletBalance < fee) throw new Error('Insufficient wallet balance.');

    for (const game of db.teenPattiGames.values()) {
      if (game.status === 'MATCHMAKING') {
        if (game.players.A?.userId === userIdStr || game.players.B?.userId === userIdStr) {
          return game;
        }
      }
    }

    if (user.depositBalance >= fee) {
      user.depositBalance -= fee;
    } else {
      const rest = fee - user.depositBalance;
      user.depositBalance = 0;
      user.winningsBalance = Math.max(0, user.winningsBalance - rest);
    }
    user.walletBalance = Math.max(0, user.walletBalance - fee);
    await user.save();

    try {
      addTransaction({
        type: 'ENTRY_FEE',
        amount: fee,
        status: 'SUCCESS',
        method: `TeenPatti Matchmaking (${variant})`
      }, user);
    } catch (err) {}

    // Process Referral Commission (2% of entry fee)
    if (user.referredBy && fee > 0) {
      try {
        const commission = parseFloat((fee * 0.02).toFixed(2));
        if (commission > 0) {
          const referrer = await UserModel.findById(user.referredBy);
          if (referrer) {
            referrer.winningsBalance = (referrer.winningsBalance || 0) + commission;
            referrer.walletBalance = (referrer.walletBalance || 0) + commission;
            referrer.referralEarnings = (referrer.referralEarnings || 0) + commission;
            await referrer.save();

            addTransaction({
              type: 'REFERRAL_COMMISSION',
              amount: commission,
              status: 'SUCCESS',
              method: `Commission from ${user.username}'s Gameplay`
            }, referrer);
          }
        }
      } catch (err) {
        console.warn('[MM] Failed to process referral commission', err);
      }
    }

    const playerObj = {
      userId: userIdStr,
      username: user.username,
      avatar: user.avatar,
      walletBalance: user.walletBalance,
      cards: [],
      seen: false,
      folded: false,
      lastBet: fee
    };

    const activeMatchIds = global.__tpQueue.get(queueKey) || [];
    let joinedGame = null;

    for (const matchId of activeMatchIds) {
      const game = db.teenPattiGames.get(matchId);
      if (game && game.status === 'MATCHMAKING' && !game.players.B) {
        game.players.B = playerObj;
        game.pot += fee;
        joinedGame = game;
        break;
      }
    }

    if (joinedGame) {
      broadcastTPQueueUpdate(queueKey);
      // DON'T start game here — socket handler must call startGame AFTER player B joins the room
      joinedGame._readyToStart = true;
      return joinedGame;
    }

    const matchId = "TP-" + Math.floor(100000 + Math.random() * 900000);
    const newGame = {
      matchId,
      variant,
      entryFee: fee,
      pot: fee,
      currentBet: fee,
      players: { A: playerObj },
      turn: null,
      turnTimerRemaining: 15,
      winner: null, // "A" or "B" or null
      status: 'MATCHMAKING',
      sideShow: null, // { requester: 'A', target: 'B', status: 'PENDING' }
      logs: []
    };

    db.teenPattiGames.set(matchId, newGame);
    activeMatchIds.push(matchId);
    global.__tpQueue.set(queueKey, activeMatchIds);
    broadcastTPQueueUpdate(queueKey);

    const refundTimeout = setTimeout(async () => {
      try {
        const g = db.teenPattiGames.get(matchId);
        if (g && g.status === 'MATCHMAKING') {
          for (const seat of ['A', 'B']) {
            if (g.players[seat]) {
              const u = await UserModel.findById(g.players[seat].userId);
              if (u) {
                u.walletBalance = (u.walletBalance || 0) + fee;
                u.depositBalance = (u.depositBalance || 0) + fee;
                await u.save();
                addTransaction({ type: 'REFUND', amount: fee, status: 'SUCCESS', method: `TeenPatti Draw Refund` }, u);
              }
            }
          }
          db.teenPattiGames.delete(matchId);
          const q = global.__tpQueue.get(queueKey) || [];
          global.__tpQueue.set(queueKey, q.filter(id => id !== matchId));
          broadcastTPQueueUpdate(queueKey);
        }
      } catch (err) {}
    }, 75000);
    global.__tpRefunds.set(matchId, refundTimeout);

    return newGame;
  }

  static startGame(matchId) {
    const game = db.teenPattiGames.get(matchId);
    if (!game || game.status !== 'MATCHMAKING' || !game.players.A || !game.players.B) return;

    if (global.__tpRefunds.has(matchId)) {
      clearTimeout(global.__tpRefunds.get(matchId));
      global.__tpRefunds.delete(matchId);
    }

    const queueKey = `${game.entryFee}:${game.variant}`;
    const q = global.__tpQueue.get(queueKey) || [];
    global.__tpQueue.set(queueKey, q.filter(id => id !== matchId));

    const deck = shuffleDeck(buildDeck());
    let jokerValue = null;
    if (game.variant === 'JOKER') {
      const randomCard = deck[Math.floor(Math.random() * deck.length)];
      jokerValue = randomCard.value;
    }
    game.jokerValue = jokerValue;

    game.players.A.cards = [deck.pop(), deck.pop(), deck.pop()];
    game.players.B.cards = [deck.pop(), deck.pop(), deck.pop()];

    game.turn = game.players.A.userId;
    game.status = 'PLAYING';
    game.turnTimerRemaining = 15;
    game.logs.push(`Game started! A vs B`);

    broadcastTPQueueUpdate(queueKey);
    broadcastTPGameUpdate(game);
    TeenPattiService.startTPGameTimer(matchId);

    if (global.teenpattiNamespace) {
      global.teenpattiNamespace.to(matchId).emit('MATCH_FOUND', { roomId: matchId, players: game.players });
      global.teenpattiNamespace.to(matchId).emit('GAME_START', { roomId: matchId, turn: game.turn });
      global.teenpattiNamespace.to(matchId).emit('CARD_DEALT', { matchId });
    }
  }

  static getGame(id) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Teen Patti room not found.");
    return game;
  }

  static async cancelMatchmaking(user) {
    const userIdStr = user._id.toString();
    for (const [matchId, game] of db.teenPattiGames.entries()) {
      if (game.status === 'MATCHMAKING') {
        const isA = game.players.A?.userId === userIdStr;
        const isB = game.players.B?.userId === userIdStr;
        
        if (isA || isB) {
          const seat = isA ? 'A' : 'B';
          delete game.players[seat];
          game.pot -= game.entryFee;
          
          user.walletBalance = (user.walletBalance || 0) + game.entryFee;
          user.depositBalance = (user.depositBalance || 0) + game.entryFee;
          await user.save();
          addTransaction({ type: 'REFUND', amount: game.entryFee, status: 'SUCCESS', method: `TeenPatti Match Cancelled` }, user);

          if (!game.players.A && !game.players.B) {
            db.teenPattiGames.delete(matchId);
            if (global.__tpRefunds.has(matchId)) {
              clearTimeout(global.__tpRefunds.get(matchId));
              global.__tpRefunds.delete(matchId);
            }
          }
          
          const queueKey = `${game.entryFee}:${game.variant}`;
          broadcastTPQueueUpdate(queueKey);
          return { success: true, refunded: game.entryFee };
        }
      }
    }
    return { success: false, message: "Not in matchmaking." };
  }

  static async handleTimeoutFold(matchId, currentTurnUserId) {
    const game = db.teenPattiGames.get(matchId);
    if (!game || game.status !== 'PLAYING') return;
    game.logs.unshift(`⏰ Timeout! Player turn expired.`);
    await TeenPattiService.concludeFold(game, currentTurnUserId);
  }

  static async handleSideShowTimeout(game) {
    game.logs.unshift(`⏰ Side Show request expired.`);
    // The target player took too long to accept/reject. Auto-reject.
    game.sideShow = null;
    game.turnTimerRemaining = 15;
    broadcastTPGameUpdate(game);
  }

  static async fold(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status !== 'PLAYING') throw new Error("Game is not active.");
    if (game.turn !== user._id.toString()) throw new Error("It is not your turn.");
    if (game.sideShow) throw new Error("Cannot fold during Side Show request.");
    await TeenPattiService.concludeFold(game, user._id.toString());
    return game;
  }

  static async concludeFold(game, foldingUserId) {
    if (game.status === 'FINISHED') return;
    const isA = game.players.A.userId === foldingUserId;
    const folder = isA ? game.players.A : game.players.B;
    const winnerSeat = isA ? 'B' : 'A';
    
    if (folder) folder.folded = true;
    game.logs.unshift(`🏳️ ${folder?.username || 'Player'} Folded!`);

    await TeenPattiService.awardWinner(game, winnerSeat, true);
  }

  static seen(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status !== 'PLAYING') throw new Error("Game is not active.");
    
    const isA = game.players.A.userId === user._id.toString();
    const player = isA ? game.players.A : game.players.B;
    
    if (player && !player.seen) {
      player.seen = true;
      game.logs.unshift(`👀 ${player.username} has seen their cards!`);
      broadcastTPGameUpdate(game);
    }
    return game;
  }

  static async chaal(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status !== 'PLAYING') throw new Error("Game is not active.");
    const userIdStr = user._id.toString();
    if (game.turn !== userIdStr) throw new Error("It is not your turn.");
    if (game.sideShow) throw new Error("Cannot play Chaal while Side Show is pending.");

    const isA = game.players.A.userId === userIdStr;
    const player = isA ? game.players.A : game.players.B;
    const opponent = isA ? game.players.B : game.players.A;
    const betSize = player.seen ? game.currentBet * 2 : game.currentBet;

    const u = await UserModel.findById(userIdStr);
    if (u.walletBalance < betSize) throw new Error("Insufficient balance.");

    if (u.depositBalance >= betSize) u.depositBalance -= betSize;
    else {
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

    game.turn = opponent.userId;
    game.turnTimerRemaining = 15;
    broadcastTPGameUpdate(game);
    return game;
  }
  
  static async requestSideShow(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status !== 'PLAYING') throw new Error("Game is not active.");
    const userIdStr = user._id.toString();
    if (game.turn !== userIdStr) throw new Error("It is not your turn.");
    if (game.sideShow) throw new Error("Side show already pending.");
    
    // Both players must be SEEN to allow side show
    if (!game.players.A.seen || !game.players.B.seen) {
        throw new Error("Both players must be SEEN for a Side Show.");
    }
    
    const isA = game.players.A.userId === userIdStr;
    const requester = isA ? 'A' : 'B';
    const target = isA ? 'B' : 'A';
    const player = game.players[requester];
    
    // Side show costs the same as chaal
    const betSize = game.currentBet * 2;
    
    const u = await UserModel.findById(userIdStr);
    if (u.walletBalance < betSize) throw new Error("Insufficient balance for Side Show.");

    if (u.depositBalance >= betSize) u.depositBalance -= betSize;
    else {
      const rest = betSize - u.depositBalance;
      u.depositBalance = 0;
      u.winningsBalance = Math.max(0, u.winningsBalance - rest);
    }
    u.walletBalance = Math.max(0, u.walletBalance - betSize);
    await u.save();

    player.walletBalance = u.walletBalance;
    player.lastBet = betSize;
    game.pot += betSize;
    
    game.sideShow = { requester, target, status: 'PENDING' };
    game.logs.unshift(`⚔️ ${player.username} requested a Side Show!`);
    game.turnTimerRemaining = 15; // Give target time to respond
    
    broadcastTPGameUpdate(game);
    return game;
  }
  
  static async respondSideShow(id, user, accept) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status !== 'PLAYING') throw new Error("Game is not active.");
    if (!game.sideShow) throw new Error("No pending side show.");
    
    const userIdStr = user._id.toString();
    const isA = game.players.A.userId === userIdStr;
    const responderSeat = isA ? 'A' : 'B';
    
    if (game.sideShow.target !== responderSeat) {
        throw new Error("You are not the target of the Side Show.");
    }
    
    if (!accept) {
        game.logs.unshift(`🛑 ${game.players[responderSeat].username} rejected the Side Show.`);
        game.sideShow = null;
        // Turn stays with the next person (the target, since requester already played their turn by requesting)
        game.turn = game.players[responderSeat].userId;
        game.turnTimerRemaining = 15;
        broadcastTPGameUpdate(game);
        return game;
    }
    
    game.logs.unshift(`✅ ${game.players[responderSeat].username} accepted the Side Show!`);
    // Compare cards. The weaker hand is folded.
    const winRef = compareHands(game.players.A.cards, game.players.B.cards, game.variant, game.jokerValue);
    const loserSeat = winRef === 'A' ? 'B' : 'A';
    
    // In Side Show, if they tie (winRef typically favors A if exact tie, but usually requester loses ties)
    // For simplicity, we just use the winRef output.
    
    game.logs.unshift(`☠️ ${game.players[loserSeat].username} lost the Side Show.`);
    await TeenPattiService.concludeFold(game, game.players[loserSeat].userId);
    return game;
  }

  static async show(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status !== 'PLAYING') throw new Error("Game is not active.");
    
    const userIdStr = user._id.toString();
    if (game.turn !== userIdStr) throw new Error("It is not your turn.");
    if (game.sideShow) throw new Error("Cannot show while Side Show is pending.");

    const isA = game.players.A.userId === userIdStr;
    const player = isA ? game.players.A : game.players.B;
    const betSize = player.seen ? game.currentBet * 2 : game.currentBet;

    const u = await UserModel.findById(userIdStr);
    if (u.walletBalance < betSize) throw new Error("Insufficient balance.");

    if (u.depositBalance >= betSize) u.depositBalance -= betSize;
    else {
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

    const winRef = compareHands(game.players.A.cards, game.players.B.cards, game.variant, game.jokerValue);
    
    await TeenPattiService.awardWinner(game, winRef, false);
    return game;
  }

  static async awardWinner(game, winnerSeat, byFold = false) {
    game.winner = winnerSeat; // "A" or "B"
    game.status = 'FINISHED';

    if (global.__tpGameIntervals.has(game.matchId)) {
      clearInterval(global.__tpGameIntervals.get(game.matchId));
      global.__tpGameIntervals.delete(game.matchId);
    }
    db.teenPattiGames.delete(game.matchId);
    broadcastTPQueueUpdate(`${game.entryFee}:${game.variant}`);
    
    const winnerData = game.players[winnerSeat];
    const loserSeat = winnerSeat === 'A' ? 'B' : 'A';
    const loserData = game.players[loserSeat];

    // Apply platform commission
    const commission = game.pot * PLATFORM_COMMISSION;
    const finalWinnings = game.pot - commission;

    try {
      const winnerUser = await UserModel.findById(winnerData.userId);
      if (winnerUser) {
        winnerUser.walletBalance = (winnerUser.walletBalance || 0) + finalWinnings;
        winnerUser.winningsBalance = (winnerUser.winningsBalance || 0) + finalWinnings;
        winnerUser.wins += 1;
        winnerUser.gamesPlayed += 1;
        winnerUser.earnings += finalWinnings;
        await winnerUser.save();
        addTransaction({ type: "WINNINGS", amount: finalWinnings, status: "SUCCESS", method: `TeenPatti Win` }, winnerUser);
      }

      const loser = await UserModel.findById(loserData.userId);
      if (loser) {
        loser.gamesPlayed += 1;
        await loser.save();
      }

      await TeenPattiMatchModel.create({
        matchId: game.matchId,
        variant: game.variant,
        entryFee: game.entryFee,
        pot: game.pot,
        players: {
          A: { userId: game.players.A.userId, username: game.players.A.username, avatar: game.players.A.avatar, cards: game.players.A.cards, folded: game.players.A.folded, seen: game.players.A.seen, winnings: winnerSeat === 'A' ? finalWinnings : 0 },
          B: { userId: game.players.B.userId, username: game.players.B.username, avatar: game.players.B.avatar, cards: game.players.B.cards, folded: game.players.B.folded, seen: game.players.B.seen, winnings: winnerSeat === 'B' ? finalWinnings : 0 }
        },
        winnerId: winnerData.userId,
        winnerName: winnerData.username
      });

      game.logs.unshift(`👑 Winner declared: ${winnerData.username} claimed ₹${finalWinnings}!`);
      
      // Emit strictly once
      if (global.teenpattiNamespace) {
        global.teenpattiNamespace.to(game.matchId).emit('GAME_RESULT', {
          winnerSeat,
          winnerId: winnerData.userId,
          loserId: loserData.userId,
          pot: game.pot,
          commission,
          finalWinnings,
          winnerCards: winnerData.cards,
          loserCards: loserData.cards,
          byFold
        });
      }
    } catch (err) {
      console.error("Error saving winner:", err);
    }
    
    broadcastTPGameUpdate(game);
  }

  static async leave(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game || game.status === 'FINISHED') return game;
    if (game.status === 'MATCHMAKING') {
      await TeenPattiService.cancelMatchmaking(user);
      return game;
    }
    await TeenPattiService.concludeFold(game, user._id.toString());
    return game;
  }
}
