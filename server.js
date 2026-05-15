require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");

// ===============================
// CONFIG
// ===============================
const PORT = Number(process.env.PORT || 5001);

const BASE_URL =
  process.env.BASE_URL ||
  process.env.SERVER_URL ||
  `http://localhost:${PORT}`;

console.log("🌍 BASE URL:", BASE_URL);

// ===============================
// ROUTES
// ===============================
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const notificationsRoutes = require("./routes/notifications");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const transactionRoutes = require("./routes/transactionRoutes");

// ===============================
// SOCKETS
// ===============================
const gameSocket = require("./sockets/gameSocket");
const tpSocket = require("./sockets/tpSocket");

// ===============================
// MODELS
// ===============================
const User = require("./models/User");

// ===============================
// APP
// ===============================
const app = express();
const server = http.createServer(app);

global.ACTIVE_MATCHES = [];

// ===============================
// CORS FIXED
// ===============================
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://ludo-frontend-8e2s.vercel.app",
  "https://*.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin
      if (!origin) return callback(null, true);

      // localhost allow
      if (origin.includes("localhost")) {
        return callback(null, true);
      }

      // vercel allow
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }

      // exact allow
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      return callback(null, false);
    },

    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
    ],
  })
);

app.options("*", cors());

// Compression for faster responses (gzip/brotli handled by reverse proxy or plugin)
try {
  const compression = require('compression');
  app.use(compression());
} catch (e) {
  console.warn('compression middleware not available:', e.message);
}

// ===============================
// BODY PARSER
// ===============================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ===============================
// STATIC FOLDERS
// ===============================
const uploadDir = path.join(__dirname, "uploads");
const qrDir = path.join(uploadDir, "qrs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

if (!fs.existsSync(qrDir)) {
  fs.mkdirSync(qrDir);
}

app.use("/uploads", express.static(uploadDir));
// Cache static uploads for short time; let CDN or proxy handle long-term caching
app.use((req, res, next) => {
  if (req.path.startsWith('/uploads')) {
    res.setHeader('Cache-Control', 'public, max-age=60');
  }
  next();
});

// ===============================
// DATABASE
// ===============================
const seedAdmin = async () => {
  try {
    const ADMIN_EMAIL = (
      process.env.ADMIN_EMAIL || "admin@gmail.com"
    ).toLowerCase();

    const ADMIN_PASSWORD =
      process.env.ADMIN_PASSWORD || "123456";

    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(
      ADMIN_PASSWORD,
      salt
    );

    await User.findOneAndUpdate(
      {
        $or: [
          { email: ADMIN_EMAIL },
          { role: "admin" },
        ],
      },
      {
        $set: {
          name: "Super Admin",
          email: ADMIN_EMAIL,
          password: hashedPassword,
          role: "admin",
          isVerified: true,
          status: "active",
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    console.log(
      `✅ Admin Account Active: ${ADMIN_EMAIL}`
    );
  } catch (err) {
    console.log("❌ Admin Seed Error:", err.message);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected Successfully");

    await seedAdmin();
  } catch (err) {
    console.log("❌ MongoDB Error:", err.message);

    setTimeout(connectDB, 5000);
  }
};

connectDB();

// ===============================
// SOCKET.IO
// ===============================
const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true,
  },
  // tune ping/pong for mobile reliability
  pingInterval: 25000,
  pingTimeout: 60000,
});

const ludoNamespace = io.of("/ludo");
const tpNamespace = io.of("/tp");

gameSocket(ludoNamespace);
tpSocket(tpNamespace);

app.set("ludoIo", ludoNamespace);
app.set("tpIo", tpNamespace);

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 OCMPLAY SERVER LIVE",
    baseUrl: BASE_URL,
  });
});

// ===============================
// ROUTES
// ===============================
app.use("/api/auth", authRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/admin", notificationsRoutes);

app.use("/api", notificationsRoutes);

app.use("/api/game", gameRoutes);

app.use("/api/wallet", walletRoutes);

app.use("/api/transactions", transactionRoutes);

// ===============================
// 404
// ===============================
app.use((req, res) => {
  console.log(
    `⚠️ 404 Not Found => ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success: false,
    message: "API Route Not Found",
  });
});

// ===============================
// START SERVER
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🌍 NODE_ENV=${process.env.NODE_ENV || "development"}`);
  }
});
