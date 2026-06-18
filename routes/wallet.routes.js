import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { WalletController } from '../controllers/wallet.controller.js';

const router = express.Router();

router.get("/", authMiddleware, WalletController.getWallet);
router.post("/deposit", authMiddleware, WalletController.deposit);
router.post("/withdraw", authMiddleware, WalletController.withdraw);
router.post("/convert", authMiddleware, WalletController.convert);
router.get("/transactions", authMiddleware, WalletController.getTransactions);

export default router;
