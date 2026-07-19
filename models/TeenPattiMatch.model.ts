import { Schema, model, Document } from 'mongoose';

export interface Card {
  rank: number; // 2-14 where 11=J,12=Q,13=K,14=A
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string; // e.g., 'A♠'
}

export interface TPPlayer {
  userId: string;
  username: string;
  avatar: string;
  walletBalance: number;
  cards: Card[];
  seen: boolean;
  folded: boolean;
  lastBet: number;
}

export interface TeenPattiMatch extends Document {
  matchId: string;
  variant: 'CLASSIC' | 'MUFLOS' | 'JOKER';
  entryFee: number;
  pot: number;
  currentBet: number;
  players: {
    A: TPPlayer;
    B?: TPPlayer;
  };
  turn: string; // userId of player whose turn it is
  turnTimerRemaining: number;
  jokerValue?: string | null;
  sideShow?: {
    requester: 'A' | 'B';
    target: 'A' | 'B';
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  };
  status: 'MATCHMAKING' | 'PLAYING' | 'FINISHED';
  logs: string[];
  winnerSeat?: 'A' | 'B';
  winnerId?: string;
}

const TPPlayerSchema = new Schema<TPPlayer>({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  avatar: { type: String, required: true },
  walletBalance: { type: Number, required: true },
  cards: [{ rank: Number, suit: String, value: String }],
  seen: { type: Boolean, default: false },
  folded: { type: Boolean, default: false },
  lastBet: { type: Number, default: 0 },
});

const TeenPattiMatchSchema = new Schema<TeenPattiMatch>({
  matchId: { type: String, required: true, unique: true },
  variant: { type: String, enum: ['CLASSIC', 'MUFLOS', 'JOKER'], required: true },
  entryFee: { type: Number, required: true },
  pot: { type: Number, default: 0 },
  currentBet: { type: Number, default: 0 },
  players: {
    A: { type: TPPlayerSchema, required: true },
    B: { type: TPPlayerSchema },
  },
  turn: { type: String, required: true },
  turnTimerRemaining: { type: Number, default: 25 },
  jokerValue: { type: String, default: null },
  sideShow: {
    requester: { type: String, enum: ['A', 'B'] },
    target: { type: String, enum: ['A', 'B'] },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
  },
  status: { type: String, enum: ['MATCHMAKING', 'PLAYING', 'FINISHED'], default: 'MATCHMAKING' },
  logs: [{ type: String }],
  winnerSeat: { type: String, enum: ['A', 'B'] },
  winnerId: { type: String },
});

export const TeenPattiMatchModel = model<TeenPattiMatch>('TeenPattiMatch', TeenPattiMatchSchema);
