import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as upiController from "../controllers/upigateway.controller.js";

const router = express.Router();

// Startup debug log to confirm route file loaded
console.log("UPIGateway routes loaded");

// Log incoming requests to this router for debugging
router.use((req, res, next) => {
  try {
    console.log(`UPIGateway Router - ${req.method} ${req.originalUrl}`);
  } catch (e) { }
  next();
});

// Create order (authenticated)
router.post("/create-order", authMiddleware, express.json(), upiController.createOrder);

// Webhook: accept any content-type as raw so we can verify signatures and parse flexibly
router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  upiController.webhookHandler
);

// Test route
router.get("/test", upiController.testRoute);

// Simple debug route to verify mount and reachability
router.get("/debug", (req, res) => {
  res.json({ success: true, route: "upigateway" });
});

// Status check (public)
router.get("/status/:clientTxnId", upiController.getStatus);

export default router;

// Log the routes defined on this router (helps detect stale deployments)
try {
  const defined = [];
  if (router && router.stack) {
    router.stack.forEach((s) => {
      if (s.route && s.route.path) {
        const methods = Object.keys(s.route.methods).join(',').toUpperCase();
        defined.push({ path: s.route.path, methods });
      }
    });
  }
  console.log('UPIGateway router definitions:', defined);
} catch (e) {
  console.warn('Failed to print UPIGateway router definitions', e);
}
