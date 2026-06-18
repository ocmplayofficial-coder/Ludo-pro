import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { TeenPattiController } from '../controllers/teenpatti.controller.js';

const router = express.Router();

router.post("/matchmaking", authMiddleware, TeenPattiController.matchmaking);
router.get("/:id", authMiddleware, TeenPattiController.getGame);
router.post("/:id/fold", authMiddleware, TeenPattiController.fold);
router.post("/:id/seen", authMiddleware, TeenPattiController.seen);
router.post("/:id/chaal", authMiddleware, TeenPattiController.chaal);
router.post("/:id/show", authMiddleware, TeenPattiController.show);

export default router;
