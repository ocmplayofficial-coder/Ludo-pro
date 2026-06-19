// server/routes/withdraw.routes.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { WithdrawController } from "../controllers/withdraw.controller.js";

const router = express.Router();

// User creates withdraw request
router.post("/create", authMiddleware, WithdrawController.createRequest);

// User withdraw history
router.get("/history", authMiddleware, WithdrawController.getHistory);

export default router;

