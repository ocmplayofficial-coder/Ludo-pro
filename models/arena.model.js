import mongoose from "mongoose";

const ArenaSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  gameType: {
    type: String,
    required: true,
    enum: ["ludo", "teenpatti"]
  },
  mode: {
    type: String,
    required: true
  },
  entryFee: {
    type: Number,
    required: true
  },
  winningPrize: {
    type: Number,
    required: true
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const ArenaModel = mongoose.model("Arena", ArenaSchema);
