import express from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { AdminController } from "../controllers/admin.controller.js";
const router = express.Router();

router.post("/send-otp", AuthController.sendOtp);
router.post("/verify-otp", AuthController.verifyOtp);
router.post("/logout", AuthController.logout);
router.post("/login", AdminController.login);

export default router;
