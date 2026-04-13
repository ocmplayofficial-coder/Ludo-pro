const mongoose = require("mongoose");

const tournamentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gameType: { type: String, enum: ['ludo', 'teenpatti'], required: true },
  entryFee: { type: Number, default: 0 },
  maxPlayers: { type: Number, default: 2 },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['upcoming', 'ongoing', 'completed'], default: 'upcoming' }
}, { timestamps: true });

module.exports = mongoose.model("Tournament", tournamentSchema);
