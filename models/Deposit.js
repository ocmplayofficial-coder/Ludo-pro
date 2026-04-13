const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  amount: Number,
  transactionId: { type: String, required: true }, // Player ko bharna hoga
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  description: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Deposit', depositSchema);