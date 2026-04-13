const mongoose = require("mongoose");

const MatchSchema = new mongoose.Schema({
  // 🎮 Game Type: Ludo ya TeenPatti
  gameType: { 
    type: String, 
    enum: ["ludo", "teenpatti"], 
    required: true 
  },
  
  // 🕹️ Mode: classic, time, turn (Ludo) | classic, muflis, ak47 (TeenPatti)
  mode: { 
    type: String, 
    required: true 
  },

  // 💰 Money Configuration
  entryFee: { 
    type: Number, 
    required: true,
    min: [0, "Entry fee cannot be negative"] 
  },
  prizeMoney: { 
    type: Number, 
    required: true 
  },
  
  // 📈 Admin Profit Tracking
  commission: { 
    type: Number, 
    default: 10 // Percentage (%) jo admin ka profit hoga
  },

  // 👥 Player Configuration
  maxPlayers: { 
    type: Number, 
    default: 2, // Default 2-player match
    enum: [2, 3, 4, 5, 6] 
  },

  // 🏷️ Display Info
  label: { 
    type: String, 
    default: "Standard Table" 
  },
  
  // 🚦 Status Control
  isActive: { 
    type: Boolean, 
    default: true 
  },

  // 🕒 Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Virtual field to calculate total pot (Optional)
MatchSchema.virtual('totalPot').get(function() {
  return this.entryFee * this.maxPlayers;
});

module.exports = mongoose.model("Match", MatchSchema);