const mongoose = require("mongoose");
const settingSchema = new mongoose.Schema({
  upiId: String,
  qrCodeUrl: String,
  minDeposit: Number,
  maxDeposit: Number,
  commissionLudo: Number,
  commissionTP: Number,
  supportNumber: String
});
module.exports = mongoose.model("Setting", settingSchema);