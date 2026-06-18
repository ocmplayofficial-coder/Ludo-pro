// server/routes/withdraw.routes.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";
import { WithdrawController } from "../controllers/withdraw.controller.js";

const router = express.Router();

// User creates withdraw request
router.post("/", authMiddleware, WithdrawController.createRequest);

// Admin list all withdraw requests
router.get("/", adminMiddleware, WithdrawController.list);

// Admin approve
router.put("/:id/approve", adminMiddleware, WithdrawController.approve);

// Admin reject
router.put("/:id/reject", adminMiddleware, WithdrawController.reject);

export default router;
