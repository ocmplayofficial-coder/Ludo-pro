import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
  suit: { type: String, required: true },
  value: { type: String, required: true },
  rank: { type: Number, required: true }
}, { _id: false });

const teenPattiMatchSchema = new mongoose.Schema({
  matchId: { type: String, required: true, unique: true },
  variant: { type: String, required: true },
  entryFee: { type: Number, required: true },
  pot: { type: Number, required: true },
  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, required: true },
    avatar: { type: String, default: 'P' },
    winnings: { type: Number, default: 0 },
    cards: [cardSchema],
    folded: { type: Boolean, default: false },
    seen: { type: Boolean, default: false }
  }],
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  winnerName: { type: String },
  status: { type: String, default: 'FINISHED' }
}, { timestamps: true });

export const TeenPattiMatchModel = mongoose.model('TeenPattiMatch', teenPattiMatchSchema);
