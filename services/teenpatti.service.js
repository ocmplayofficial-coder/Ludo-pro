import { db } from '../config/db.js';
import { createTeenPattiTable } from '../game-engine/teenpatti/tableManager.js';
import { getSeenBetAmount, handlePlayerSeen } from '../game-engine/teenpatti/seenManager.js';
import { getBlindBetAmount } from '../game-engine/teenpatti/blindManager.js';
import { handleFold } from '../game-engine/teenpatti/packManager.js';
import { handleShowdown } from '../game-engine/teenpatti/showManager.js';
import { evaluateTeenPattiHand, compareHands } from '../game-engine/teenpatti/winnerEngine.js';
import { addTransaction } from '../wallet/transaction.service.js';

export class TeenPattiService {
  static matchmaking(user, variant, minBet) {
    const bet = parseFloat(minBet);
    if (isNaN(bet) || bet <= 0) {
      throw new Error("Invalid minimum bet amount.");
    }

    if (user.walletBalance < bet * 4) {
      throw new Error("Require at least 4x stack of the minimum bet to enter the high stakes table.");
    }

    // Deduct initial min bet
    if (user.depositBalance >= bet) {
      user.depositBalance -= bet;
    } else {
      const rest = bet - user.depositBalance;
      user.depositBalance = 0;
      user.winningsBalance -= rest;
    }
    user.walletBalance -= bet;

    addTransaction({
      type: "ENTRY_FEE",
      amount: bet,
      status: "SUCCESS",
      method: `Teen Patti Table (${variant})`
    });

    const matchId = "TP-" + Math.floor(100000 + Math.random() * 900000);
    const game = createTeenPattiTable(matchId, variant, bet);
    db.teenPattiGames.set(matchId, game);

    return game;
  }

  static getGame(id) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Teen Patti room not found.");
    return game;
  }

  static fold(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Game has already concluded.");

    handleFold(game, 'player');
    user.gamesPlayed += 1;
    return game;
  }

  static seen(id) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");

    handlePlayerSeen(game);
    return game;
  }

  static chaal(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Match concluded.");

    const betSize = game.playerSeen ? getSeenBetAmount(game.currentBet) : getBlindBetAmount(game.currentBet);

    if (user.walletBalance < betSize) {
      throw new Error("Insufficient wallet balance to match this Chaal.");
    }

    // Deduct
    if (user.depositBalance >= betSize) {
      user.depositBalance -= betSize;
    } else {
      const rest = betSize - user.depositBalance;
      user.depositBalance = 0;
      user.winningsBalance -= rest;
    }
    user.walletBalance -= betSize;

    game.pot += betSize;
    game.logs.unshift(`You played Chaal: Added ₹${betSize} to the pot.`);



    return game;
  }

  static show(id, user) {
    const game = db.teenPattiGames.get(id);
    if (!game) throw new Error("Game not found.");
    if (game.status !== 'PLAYING') throw new Error("Match finished.");

    const betSize = game.playerSeen ? getSeenBetAmount(game.currentBet) : getBlindBetAmount(game.currentBet);

    if (user.walletBalance < betSize) {
      throw new Error(`Need ₹${betSize} to request active standard Show.`);
    }

    // Deduct
    if (user.depositBalance >= betSize) {
      user.depositBalance -= betSize;
    } else {
      const rest = betSize - user.depositBalance;
      user.depositBalance = 0;
      user.winningsBalance -= rest;
    }
    user.walletBalance -= betSize;
    game.pot += betSize;

    const userWon = compareHands(game.playerHand, game.botHand, game.variant) === 'player';
    handleShowdown(game);

    if (userWon) {
      user.walletBalance += game.pot;
      user.winningsBalance += game.pot;
      user.wins += 1;
      user.gamesPlayed += 1;
      user.earnings += game.pot;

      addTransaction({
        type: "WINNINGS",
        amount: game.pot,
        status: "SUCCESS",
        method: `Teen Patti Win (${game.variant})`
      });
    } else {
      user.gamesPlayed += 1;
    }

    return game;
  }
}
