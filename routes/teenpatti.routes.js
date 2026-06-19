import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { TeenPattiController } from '../controllers/teenpatti.controller.js';

const router = express.Router();

router.get("/arenas", authMiddleware, TeenPattiController.getArenas);
router.get("/tables", authMiddleware, TeenPattiController.getTables);
router.post("/join", authMiddleware, TeenPattiController.matchmaking);
router.post("/leave", authMiddleware, TeenPattiController.leave);
router.post("/place-bet", authMiddleware, TeenPattiController.chaal);
router.post("/pack", authMiddleware, TeenPattiController.fold);
router.post("/show", authMiddleware, TeenPattiController.show);
router.get("/history", authMiddleware, TeenPattiController.getMatchHistory);
router.post("/cancel-matchmaking", authMiddleware, TeenPattiController.cancelMatchmaking);
router.get("/:id", authMiddleware, TeenPattiController.getGame);

export default router;
