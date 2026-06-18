import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { ReferralController } from '../controllers/referral.controller.js';

const router = express.Router();

router.post("/apply", authMiddleware, ReferralController.apply);

export default router;
