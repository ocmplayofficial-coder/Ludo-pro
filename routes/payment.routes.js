// server/routes/payment.routes.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { PaymentController } from "../controllers/payment.controller.js";

const router = express.Router();
router.get("/test", (req, res) => {
    res.json({
        success: true,
        route: "payment working"
    });
});

// Create a new payment order – authenticated user
router.post("/create-order", authMiddleware, PaymentController.createOrder);

// Razorpay webhook – no auth, but signature verification inside controller
router.post("/webhook", express.raw({ type: "*/*" }), PaymentController.handleWebhook);

export default router;
