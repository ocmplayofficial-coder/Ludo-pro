import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { UserController } from '../controllers/user.controller.js';

const router = express.Router();

router.get("/profile", authMiddleware, UserController.getProfile);
router.post("/profile/update", authMiddleware, UserController.updateProfile);
router.get("/support/messages", authMiddleware, UserController.getSupportMessages);
router.post("/support/messages", authMiddleware, UserController.addSupportMessage);

export default router;
