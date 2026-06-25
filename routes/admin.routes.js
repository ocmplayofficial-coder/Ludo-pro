import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { AdminController } from "../controllers/admin.controller.js";
import { upload } from "../middleware/upload.js";
import { WithdrawController } from "../controllers/withdraw.controller.js";

console.log("AdminController =", AdminController);
console.log("getLiveMatches =", AdminController.getLiveMatches);
console.log("getGames =", AdminController.getGames);
console.log("getGameStats =", AdminController.getGameStats);
console.log("getArenas =", AdminController.getArenas);
const router = express.Router();

// ======================
// ADMIN AUTH
// ======================
router.post(
    "/login",
    AdminController.login
);
router.get(
    "/users/all",
    authMiddleware,
    AdminController.getAllUsers
);

router.post(
    "/users/update-wallet",
    authMiddleware,
    AdminController.updateWallet
);

router.post(
    "/users/ban",
    authMiddleware,
    AdminController.banUser
);
// ======================
// DASHBOARD
// ======================
router.get(
    "/dashboard-stats",
    authMiddleware,
    AdminController.getDashboardStats
);

// ======================
// LIVE MATCHES
// ======================
router.get(
    "/live-matches",
    authMiddleware,
    AdminController.getLiveMatches
);

// ======================
// GAMES LIST
// ======================
router.get(
    "/games",
    authMiddleware,
    AdminController.getGames
);
//CREATE PRICE POOL
router.post(
    "/create-game",
    authMiddleware,
    AdminController.createGame
);

// ======================
router.get(
    "/arenas",
    authMiddleware,
    AdminController.getArenas
);
router.get(
    "/payment-methods/all",
    authMiddleware,
    AdminController.getPaymentMethods
);

router.post(
    "/payment-methods/add",
    authMiddleware,
    upload.any(),
    AdminController.addPaymentMethod
);
router.get(
    "/transactions",
    authMiddleware,
    AdminController.getTransactions
);

router.get(
    "/financial-stats",
    authMiddleware,
    AdminController.getFinancialStats
);

router.delete(
    "/payment-methods/remove/:id",
    authMiddleware,
    AdminController.removePaymentMethod
);
// ======================
// GAME STATS
// ======================
router.get(
    "/game-stats",
    authMiddleware,
    AdminController.getGameStats
);

// ======================
// TRANSACTIONS
// ======================
router.post(
    "/transactions/:id/action",
    authMiddleware,
    AdminController.handleTransactionAction
);

// ======================
// DEPOSIT REQUESTS
// ======================
router.get(
    "/deposit-requests",
    authMiddleware,
    AdminController.getDepositRequests
);

router.post(
    "/deposit-requests/:id/action",
    authMiddleware,
    AdminController.handleDepositRequestAction
);

// ======================
// WITHDRAW REQUESTS
// ======================
router.get(
    "/withdraws",
    authMiddleware,
    WithdrawController.adminList
);
router.get(
    "/withdraws/:id",
    authMiddleware,
    WithdrawController.adminGetDetails
);
router.put(
    "/withdraws/:id/approve",
    authMiddleware,
    WithdrawController.adminApprove
);
router.put(
    "/withdraws/:id/reject",
    authMiddleware,
    WithdrawController.adminReject
);

// ======================
// TEEN PATTI ADMIN MODULE
// ======================
router.post(
    "/teenpatti/arenas/create",
    authMiddleware,
    AdminController.createTPArena
);
router.put(
    "/teenpatti/arenas/:id/edit",
    authMiddleware,
    AdminController.editTPArena
);
router.delete(
    "/teenpatti/arenas/:id/delete",
    authMiddleware,
    AdminController.deleteTPArena
);
router.get(
    "/teenpatti/live-matches",
    authMiddleware,
    AdminController.getTPLiveMatches
);
router.get(
    "/teenpatti/stats",
    authMiddleware,
    AdminController.getTPStats
);
router.get(
    "/teenpatti/history",
    authMiddleware,
    AdminController.getTPHistory
);

export default router;