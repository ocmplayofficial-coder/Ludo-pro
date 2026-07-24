import mongoose from 'mongoose';

const ludoPlayerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  avatar: { type: String, default: 'P' },
  color: { type: String, required: true },
  score: { type: Number, default: 0 }
}, { _id: false });

const ludoMatchSchema = new mongoose.Schema({
  matchId: { type: String, required: true, unique: true },
  variant: { type: String, required: true }, // CLASSIC, TURN, TIME
  entryFee: { type: Number, required: true },
  winningPrize: { type: Number, required: true },
  players: {
    red: { type: ludoPlayerSchema, required: true },
    yellow: { type: ludoPlayerSchema }
  },
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  winnerColor: { type: String }, // red, yellow, or draw
  status: { type: String, default: 'FINISHED' }
}, { timestamps: true });

export const LudoMatchModel = mongoose.model('LudoMatch', ludoMatchSchema);
