const mongoose = require('mongoose');

const tpGameSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  mode: { 
    type: String, 
    enum: ['CLASSIC', 'MUFLIS', 'AK47', 'JOKER'], 
    default: 'CLASSIC' 
  },
  bootAmount: { type: Number, required: true },
  potAmount: { type: Number, default: 0 },
  
  // 🔥 ADMIN ANALYTICS FIELDS
  platformFee: { type: Number, default: 0 }, // Admin ka commission (Rake)
  totalBets: { type: Number, default: 0 },   // Total kitni betting hui is table par
  
  maxPlayers: { type: Number, default: 5 },
  
  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    socketId: String, // Real-time control ke liye zaroori
    cards: [Object],  // { suit: '♠', value: 'A' }
    isSeen: { type: Boolean, default: false },
    isPacked: { type: Boolean, default: false },
    lastBet: { type: Number, default: 0 },
    walletAtStart: { type: Number }
  }],

  currentTurn: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['waiting', 'playing', 'finished', 'terminated'], 
    default: 'waiting' 
  },
  
  // 🔥 WINNER DETAILS (Dashboard par display ke liye)
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  winnerName: { type: String, default: "" },
  prizeWon: { type: Number, default: 0 },

  // Auto-delete after 24 hours (Admin can check yesterday's logs)
  createdAt: { type: Date, default: Date.now, expires: 86400 } 
}, { timestamps: true });

// Middleware to calculate platform fee before saving if game is finished
tpGameSchema.pre('save', function(next) {
  if (this.status === 'finished' && this.potAmount > 0) {
    // Example: 5% platform fee (Aap isse admin panel se change bhi kar sakte ho)
    this.platformFee = this.potAmount * 0.05; 
    this.prizeWon = this.potAmount - this.platformFee;
  }
  next();
});

module.exports = mongoose.model('TPGame', tpGameSchema);