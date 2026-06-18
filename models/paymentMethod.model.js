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

        qrImage: {
            type: String,
            default: ""
        },

        active: {
            type: Boolean,
            default: true
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