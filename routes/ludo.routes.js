import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { LudoController } from '../controllers/ludo.controller.js';

const router = express.Router();

router.post("/matchmaking", authMiddleware, LudoController.matchmaking);
router.post("/matchmaking/cancel", authMiddleware, LudoController.matchmakingCancel);
router.get("/:id", authMiddleware, LudoController.getGame);
router.post("/:id/roll", authMiddleware, LudoController.roll);
router.post("/:id/move", authMiddleware, LudoController.move);

router.post("/:id/timeout", authMiddleware, LudoController.timeout);
router.post("/:id/end-time-mode", authMiddleware, LudoController.endTimeMode);
router.post("/:id/leave", authMiddleware, LudoController.leave);

export default router;
