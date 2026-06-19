import { db } from '../../config/db.js';
import { addTransaction, getFormattedDateTime } from '../../wallet/transaction.service.js';

/**
 * Create a new Ludo room in MATCHMAKING state.
 * No wallet deduction is performed here – the entry fee will be charged
 * only when the match is formed (two players are paired).
 */
export function createLudoRoom(user, variant, entryFee) {
  const fee = parseFloat(entryFee);
  // Note: wallet deduction/validation is handled by LudoService.matchmaking.
  // createLudoRoom should not re-check or deduct the user's balance because
  // the service layer performs that responsibility.

  // Generate a unique match ID
  const matchId = "LUDO-" + Math.floor(100000 + Math.random() * 900000);

  // Determine winningPrize: prefer configured arena value if present,
  // otherwise compute from entry fee (2 * fee - platformFee)
  const platformFee = 30;
  // Try to find a matching arena in the in-memory DB
  let winningPrize = null;
  try {
    const arenaMatch = (db.gameArenas || []).find(a => {
      return a.gameType === 'ludo' && String(a.mode).toUpperCase() === String(variant).toUpperCase() && Number(a.entryFee) === Number(fee);
    });
    if (arenaMatch && typeof arenaMatch.winningPrize !== 'undefined') {
      winningPrize = Number(arenaMatch.winningPrize);
    }
  } catch (err) {
    console.warn('Failed to resolve arena-configured winningPrize, falling back to computed prize', err);
  }

  if (winningPrize === null) {
    const totalPot = fee * 2;
    winningPrize = Math.max(0, totalPot - platformFee);
  }

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
