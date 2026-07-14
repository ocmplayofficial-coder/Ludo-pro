import { Server } from 'socket.io';
import { handleLudoSocket } from './ludo.socket.js';
import { verifyToken } from '../config/jwt.js';
import { UserModel } from '../models/user.model.js';
import { StatsService } from '../services/stats.service.js';

import { handleTeenPattiSocket } from './teenpatti.socket.js';

global.onlineUsers = new Map();
global.activeGames = new Map();

function trackAuthenticatedUser(io, userId, socketId) {
  if (!userId) return;
  global.onlineUsers.set(userId, socketId);
  if (io) {
    StatsService.emitStatsUpdate(io).catch(err => console.error('STATS_EMIT_ERROR', err));
  }
}

function untrackAuthenticatedUser(io, userId) {
  if (!userId) return;
  global.onlineUsers.delete(userId);
  if (io) {
    StatsService.emitStatsUpdate(io).catch(err => console.error('STATS_EMIT_ERROR', err));
  }
}

export function initWebSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Set up namespaces
  const lobbyNamespace = io.of('/lobby');
  const ludoNamespace = io.of('/ludo');
  global.ludoNamespace = ludoNamespace;
  const teenpattiNamespace = io.of('/teenpatti');
  global.teenpattiNamespace = teenpattiNamespace;
  const walletNamespace = io.of('/wallet');

  // Authentication middleware for all namespaces
  const authMiddleware = async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }
      const decoded = verifyToken(token);
      if (!decoded || !decoded.id) {
        return next(new Error("Authentication error: Invalid token"));
      }
      const user = await UserModel.findById(decoded.id);
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }
      socket.user = user;
      console.log('SOCKET USER', user._id);
      next();
    } catch (err) {
      next(err);
    }
  };

  lobbyNamespace.use(authMiddleware);
  ludoNamespace.use(authMiddleware);
  teenpattiNamespace.use(authMiddleware);
  walletNamespace.use(authMiddleware);

  lobbyNamespace.on('connection', (socket) => {
    console.log('Lobby Socket.IO client connected:', socket.id, 'User:', socket.user._id);
    const userId = socket.user && socket.user._id ? socket.user._id.toString() : null;
    if (userId) {
      trackAuthenticatedUser(io, userId, socket.id);
    }
    socket.on('message', (data) => {
      console.log('Lobby message received:', data);
    });
    socket.on('disconnect', () => {
      if (userId) {
        untrackAuthenticatedUser(io, userId);
      }
    });
  });

  // Connect TeenPatti namespace socket handlers
  handleTeenPattiSocket(teenpattiNamespace);

  walletNamespace.on('connection', (socket) => {
    console.log('Wallet Socket.IO client connected:', socket.id, 'User:', socket.user._id);
    const userId = socket.user && socket.user._id ? socket.user._id.toString() : null;
    if (userId) {
      trackAuthenticatedUser(io, userId, socket.id);
    }
    socket.on('message', (data) => {
      console.log('Wallet message received:', data);
    });
    socket.on('disconnect', () => {
      if (userId) {
        untrackAuthenticatedUser(io, userId);
      }
    });
  });

  // Connect Ludo namespace socket handlers
  handleLudoSocket(ludoNamespace);

// Track online players globally
io.on('connection', (socket) => {
  const userId = socket.user && socket.user._id ? socket.user._id.toString() : null;
  if (userId) {
    global.onlineUsers.set(userId, socket.id);
  }
  socket.on('disconnect', () => {
    if (userId) {
      global.onlineUsers.delete(userId);
    }
  });
});

  return io;
}
