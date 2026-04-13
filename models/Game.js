const mongoose = require("mongoose");

/**
 * 🎲 GAME SCHEMA
 * Used for both waiting tables and active Ludo games.
 */
const tokenSchema = new mongoose.Schema({
  position: { type: Number, default: -1 },
  steps: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["home", "active", "finished"],
    default: "home"
  }
}, { _id: false });

const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  socketId: String,
  color: { type: String, enum: ["red", "blue", "green", "yellow"] },
  name: String,
  phone: String,
  lives: { type: Number, default: 3 },
  isOnline: { type: Boolean, default: true },
  hasLeft: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const gameSchema = new mongoose.Schema({
  gameId: { type: String, unique: true, sparse: true, index: true },
  roomId: { type: String, unique: true, sparse: true, index: true },
  gameType: { type: String, enum: ["ludo", "teenpatti"], default: "ludo", index: true },
  type: { type: String, enum: ["classic", "time", "turn"], default: "classic" },
  mode: { type: String, enum: ["classic", "time", "turn"], default: function() { return this.type || "classic"; }, index: true },
  adminCommission: { type: Number, default: 0 },
  potAmount: { type: Number, default: 0 },
  entryFee: { type: Number, default: 0 },
  prizeMoney: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["active", "waiting", "playing", "finished", "cancelled"],
    default: "waiting",
    index: true
  },
  players: [playerSchema],
  playersJoined: { type: Number, default: 0 },
  maxPlayers: { type: Number, default: 2 },
  gameState: {
    currentTurn: { type: Number, default: 0 },
    diceValue: { type: Number, default: 0 },
    consecutiveSixes: { type: Number, default: 0 },
    turnStartTime: Date,
    turnTimeLimit: { type: Number, default: 20 },
    totalMoves: { type: Number, default: 0 },
    turnCount: { type: Number, default: 0 },
    turnLimit: { type: Number, default: 0 },
    scores: {
      red: { type: Number, default: 0 },
      blue: { type: Number, default: 0 },
      green: { type: Number, default: 0 },
      yellow: { type: Number, default: 0 }
    }
  },
  tokens: {
    red: [tokenSchema],
    blue: [tokenSchema],
    green: [tokenSchema],
    yellow: [tokenSchema]
  },
  winner: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    color: String,
    prize: Number
  },
  finishReason: String,
  startedAt: Date,
  finishedAt: Date,
  timeEndAt: Date,
  createdAt: { type: Date, default: Date.now, expires: 86400 }
}, { timestamps: true });

function createTokens() {
  return Array.from({ length: 4 }, () => ({
    position: -1,
    steps: 0,
    status: "home"
  }));
}

gameSchema.pre("save", function (next) {
  if (this.isNew && (!this.tokens || Object.keys(this.tokens).length === 0)) {
    this.tokens = {
      red: createTokens(),
      blue: createTokens(),
      green: createTokens(),
      yellow: createTokens()
    };
  }

  if (!this.mode || this.mode !== this.type) {
    this.mode = this.type || "classic";
  }

  if (!this.gameId && this.roomId) {
    this.gameId = this.roomId;
  }

  next();
});

gameSchema.methods.isFull = function() {
  return this.playersJoined >= this.maxPlayers;
};

module.exports = mongoose.model("Game", gameSchema);
