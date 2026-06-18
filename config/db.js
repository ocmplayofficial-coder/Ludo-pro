import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
  try {
    await mongoose.connect(env.MONGO_URI);

    console.log("✅ MongoDB Connected Successfully");
    console.log("Database:", mongoose.connection.name);

    mongoose.connection.on("connected", () => {
      console.log("🟢 MongoDB connection established");
    });

    mongoose.connection.on("error", (err) => {
      console.error("🔴 MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("🟠 MongoDB connection disconnected");
    });

    return true;

  } catch (error) {

    console.error("❌ MongoDB Connection Failed");
    console.error(error);

    process.exit(1);
  }
}

export const db = {
  users: new Map(),

  transactions: [],

  supportMessages: [
    {
      id: "S1",
      sender: "agent",
      text: "Hello! Welcome to OCMPLAY Support. How can we help you win real cash today? 🏆",
      timestamp: "Just now"
    }
  ],

  ludoGames: new Map(),

  teenPattiGames: new Map(),

  // NEW
  gameArenas: []
};

// Debug logging
console.log("DB OBJECT", db);
console.log("LUDO MAP SIZE", db.ludoGames.size);

db.transactions = [];