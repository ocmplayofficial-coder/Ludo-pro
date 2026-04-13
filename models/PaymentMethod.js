const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
    type: { type: String, enum: ['upi', 'qr'], required: true },
    upiId: { type: String }, 
    qrImageUrl: { type: String }, 
    name: { type: String, default: 'Payment Account' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    usageCount: { type: Number, default: 0 } // Isse rotation logic chalega
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);