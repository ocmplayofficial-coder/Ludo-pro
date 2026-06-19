import express from "express";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { initWebSocketServer } from "./sockets/index.js";
import paymentRoutes from "./routes/payment.routes.js";

console.log("PAYMENT ROUTES =", paymentRoutes);

// Routes imports
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import ludoRoutes from "./routes/ludo.routes.js";
import teenPattiRoutes from "./routes/teenpatti.routes.js";
// duplicate import removed
import referralRoutes from "./routes/referral.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import statsRoutes from './routes/stats.routes.js';
import paymentMethodRoutes from "./routes/paymentMethod.routes.js";
import depositRequestRoutes from "./routes/depositRequest.routes.js";
import withdrawRoutes from "./routes/withdraw.routes.js";
async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 5000;

  // Middlewares
  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "https://ocmplay.netlify.app",
    "http://127.0.0.1:8080"
  ];
  

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
  }));
  app.use(express.json());
  app.use(
    "/uploads",
    express.static(path.join(process.cwd(), "uploads"))
  );

  // Connect database mock
  await connectDB();

  // Seed default active payment method if none exist
  try {
    const { PaymentMethodModel } = await import("./models/paymentMethod.model.js");
    const count = await PaymentMethodModel.countDocuments();
    if (count === 0) {
      // try to copy a bundled QR from client build into uploads
      const bundledQrCandidates = [
        path.join(process.cwd(), 'client', 'dist', 'assets', 'QR.png'),
        path.join(process.cwd(), '..', 'client', 'dist', 'assets', 'QR.png')
      ];
      let bundledQr = '';
      for (const c of bundledQrCandidates) {
        if (fs.existsSync(c)) {
          bundledQr = c;
          break;
        }
      }
      let qrFilename = '';
      try {
        if (bundledQr && fs.existsSync(bundledQr)) {
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          qrFilename = `${Date.now()}-QR.png`;
          fs.copyFileSync(bundledQr, path.join(uploadsDir, qrFilename));
          console.log('Copied bundled QR to uploads/', qrFilename);
        }
      } catch (e) {
        console.warn('Failed copying bundled QR file', e);
      }

      await PaymentMethodModel.create({
        type: "upi",
        upiId: "admin@upi",
        qrCode: qrFilename,
        active: true
      });
      console.log("🟢 Seeded default active payment method (admin@upi)");
    }
  } catch (err) {
    console.error("Failed to seed payment method:", err);
  }

  // Health check route with DB status
  app.get("/health", (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({
      status: "OK",
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Bind Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/wallet", walletRoutes);
  app.use("/api/ludo", ludoRoutes);
  app.use("/api/teenpatti", teenPattiRoutes);
  app.use("/api/payment", paymentRoutes);
  app.use("/api/referral", referralRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/payment-methods", paymentMethodRoutes);
  app.use("/api/deposit-request", depositRequestRoutes);
  app.use("/api/withdraw", withdrawRoutes);
  // Stats endpoint
  // Duplicate import of statsRoutes removed
  app.use('/api/stats', statsRoutes);

  // Setup WebSockets (Socket.IO)
  const server = createServer(app);
  // expose io globally for other modules (e.g., payment webhook)
  global.io = initWebSocketServer(server);

  // Static Production files serving
  // if (process.env.NODE_ENV === "production") {
  //   const distPath = path.join(process.cwd(), 'client', 'dist');
  //   app.use(express.static(distPath));
  //   app.get('*', (req, res) => {
  //     res.sendFile(path.join(distPath, 'index.html'));
  //   });
  // }

  app.get("/", (req, res) => {
    res.json({
      success: true,
      message: "OCMPLAY Backend Running",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Ludo & Card Pro Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical: Failed to launch game server:", err);
});
