const mongoose = require("mongoose");

/**
 * MONGODB CONNECTION CONFIG
 * Optimized for High-Concurrency Gaming (Ludo Pro)
 */

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGO_URI or MONGODB_URI not found in .env file");
    }

    const options = {
      dbName: "ludo_pro",
      autoIndex: true, // Indexes automatically create honge (Search fast hogi)
      
      // 🔥 PERFORMANCE TUNING
      maxPoolSize: 50,          // Ek saath 50 connections open reh sakte hain
      serverSelectionTimeoutMS: 30000, // 30 sec mein primary select nahi hua toh error dega
      connectTimeoutMS: 30000,  // 30 sec mein connect nahi hua toh close karega
      socketTimeoutMS: 45000,    // Idle connections 45s baad close honge
      family: 4                  // IPv4 force karega (Jaldi connect hota hai)
    };

    mongoose.set("strictQuery", false);
    const conn = await mongoose.connect(uri, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // --- 📡 REAL-TIME CONNECTION MONITORING ---
    
    mongoose.connection.on("error", (err) => {
      console.error(`❌ MongoDB Runtime Error: ${err.message}`);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB Disconnected. Checking connectivity...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB Reconnected. Resuming data sync.");
    });

    // Node process band hone par connection close karega (Safe Exit)
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("🔌 MongoDB connection closed due to app termination");
      process.exit(0);
    });

  } catch (error) {
    console.error(`❌ DB Initial Connection Failed: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;