import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { UserController } from '../controllers/user.controller.js';

const router = express.Router();

router.get("/profile", authMiddleware, UserController.getProfile);
router.post("/profile/update", authMiddleware, UserController.updateProfile);
router.get("/leaderboard", authMiddleware, UserController.getLeaderboard);
router.get("/support/messages", authMiddleware, UserController.getSupportMessages);
router.post("/support/messages", authMiddleware, UserController.addSupportMessage);
router.get("/match-history", authMiddleware, UserController.getMatchHistory);
router.get("/referrals", authMiddleware, UserController.getMyReferrals);

export default router;
