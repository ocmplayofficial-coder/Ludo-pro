import { db } from '../../config/db.js';
import { addTransaction, getFormattedDateTime } from '../../wallet/transaction.service.js';

/**
 * Create a new Ludo room in MATCHMAKING state.
 * No wallet deduction is performed here – the entry fee will be charged
 * only when the match is formed (two players are paired).
 */
export function createLudoRoom(user, variant, entryFee) {
  const fee = parseFloat(entryFee);
  // Validate user can afford the entry fee (but do not deduct yet)
  if (user.walletBalance < fee) {
    throw new Error("Insufficient wallet balance to join this Ludo room.");
  }

  // Generate a unique match ID
  const matchId = "LUDO-" + Math.floor(100000 + Math.random() * 900000);

  // Prize after platform fee (₹30) – total pot will be 2 * fee, winner gets pot - fee
  const totalPot = fee * 2;
  const platformFee = 30;
  const winningPrize = Math.max(0, totalPot - platformFee);

  // Initialise tokens for both colors (yellow will be opponent later)
  const tokens = [];
  const initialPosition = (variant === 'TURN' || variant === 'TIME') ? 0 : -1;
  for (let i = 0; i < 4; i++) {
    tokens.push({ id: i, color: 'red', position: initialPosition, prevPosition: initialPosition });
  }
  for (let i = 0; i < 4; i++) {
    tokens.push({ id: i + 4, color: 'yellow', position: initialPosition, prevPosition: initialPosition });
  }

  const newGame = {
    matchId,
    variant,
    entryFee: fee,
    winningPrize,
    players: {
      red: { userId: user._id, username: user.username, avatar: user.avatar },
      yellow: null // filled when opponent joins
    },
    scores: { red: 0, yellow: 0 },
    turn: 'red',
    diceRoll: null,
    diceHasRolled: false,
    tokens,
    winner: null,
    movesRemaining: variant === 'TURN' ? 25 : 999,
    timerRemaining: variant === 'TIME' ? 300 : 9999,
    redLives: 3,
    yellowLives: 3,
    turnTimerRemaining: 6,
    status: 'MATCHMAKING',
    logs: ["Waiting for opponent..."],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  db.ludoGames.set(matchId, newGame);

  console.log(
    "ROOM_CREATED =",
    matchId
  );

  console.log(
    "AFTER_CREATE_SIZE =",
    db.ludoGames.size
  );

  return newGame;
}

/** Retrieve a Ludo room by its match ID */
export function getLudoRoom(matchId) {
  return db.ludoGames.get(matchId);
}
