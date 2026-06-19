import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["upi", "qr"],
            required: true
        },

        upiId: {
            type: String,
            default: ""
        },

        qrCode: {
            type: String,
            default: ""
        },

        active: {
            type: Boolean,
            default: true
        }
        ,
        usageCount: {
            type: Number,
            default: 0
        },
        lastUsedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

export const PaymentMethodModel =
    mongoose.model(
        "PaymentMethod",
        paymentMethodSchema
    );