const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs"); 
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// --- 🛣️ 1. IMPORT ROUTES ---
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const notificationsRoutes = require("./routes/notifications");
const gameRoutes = require("./routes/game");
const walletRoutes = require("./routes/wallet");
const transactionRoutes = require("./routes/transactionRoutes");

const auth = require("./middleware/authMiddleware");
const roleMiddleware = require("./middleware/roleMiddleware");
const adminController = require("./controllers/adminController");

// --- 🔌 2. IMPORT SOCKET HANDLERS ---
const gameSocket = require("./sockets/gameSocket");
const tpSocket = require("./sockets/tpSocket");

// --- 👤 3. IMPORT USER MODEL ---
const User = require("./models/User"); 

const app = express();
const server = http.createServer(app);

global.ACTIVE_MATCHES = [];

// --- 🛡️ 4. CORS CONFIGURATION (Enhanced) ---
const allowedOrigins = [
  "http://localhost:3000", 
  "http://localhost:5173", 
  "http://localhost:8080"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes("localhost")) {
      callback(null, true);
    } else {
      callback(new Error("CORS Policy: Origin not allowed"), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "cache-control",
    "Pragma",
    "Expires"
  ],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use((req, res, next) => {
  console.log(`➡️ HIT: ${req.method} ${req.originalUrl}`);
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Authorization, cache-control, Pragma, Expires"
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ✅ 5. STATIC FOLDER SETUP (QR Codes visibility)
const uploadDir = path.join(__dirname, "uploads");
const qrDir = path.join(uploadDir, "qrs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);

app.use("/uploads", express.static(uploadDir));

// --- 🗄️ 6. DATABASE & ADMIN SEEDING ---
const seedAdmin = async () => {
  try {
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase();
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

    await User.findOneAndUpdate(
      { $or: [{ email: ADMIN_EMAIL }, { role: "admin" }] },
      {
        $set: {
          name: "Super Admin",
          email: ADMIN_EMAIL,
          password: hashedPassword,
          role: "admin",
          isVerified: true,
          status: "active"
        }
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Admin Account Active: ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error("❌ Admin Seeding Failed:", err.message);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected Successfully`);
    await seedAdmin(); 
  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
    setTimeout(connectDB, 5000); 
  }
};
connectDB();

// --- 🔌 7. SOCKET.IO SETUP ---
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true }
});

const ludoNamespace = io.of("/ludo");
const tpNamespace = io.of("/tp");

gameSocket(ludoNamespace);
tpSocket(tpNamespace);
app.set("ludoIo", ludoNamespace);
app.set("tpIo", tpNamespace);

// --- 🛣️ 8. API ROUTES MOUNTING ---
app.get("/", (req, res) => res.send("🚀 OSMPLAY Server is Live"));

// 🔥 Routing Map
app.use("/api/auth", authRoutes);
app.use("/api/admin", notificationsRoutes);
app.use("/api/admin", adminRoutes);     // Admin QR Management yahan hai
app.use("/api", notificationsRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);   // Game App payment info yahan se lega
app.use("/api/transactions", transactionRoutes); 

// Catch-all 404 handler for debugging
app.use((req, res) => {
  console.log(`⚠️ 404 - Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: "Route not found on server" });
});

// --- 🚀 9. START SERVER ---
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});