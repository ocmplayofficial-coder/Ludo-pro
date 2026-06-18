import { Server } from 'socket.io';
import { handleLudoSocket } from './ludo.socket.js';
import { verifyToken } from '../config/jwt.js';
import { UserModel } from '../models/user.model.js';

global.onlinePlayers = new Set();
global.activeGames = new Map();
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
    global.onlinePlayers.add(userId);
  }
  socket.on('message', (data) => {
    console.log('Lobby message received:', data);
  });
  socket.on('disconnect', () => {
    if (userId) {
      global.onlinePlayers.delete(userId);
    }
  });
});

  teenpattiNamespace.on('connection', (socket) => {
    console.log('TeenPatti Socket.IO client connected:', socket.id, 'User:', socket.user._id);
    socket.on('message', (data) => {
      console.log('TeenPatti message received:', data);
    });
  });

  walletNamespace.on('connection', (socket) => {
    console.log('Wallet Socket.IO client connected:', socket.id, 'User:', socket.user._id);
    socket.on('message', (data) => {
      console.log('Wallet message received:', data);
    });
  });

  // Connect Ludo namespace socket handlers
  handleLudoSocket(ludoNamespace);

// Track online players globally
io.on('connection', (socket) => {
  const userId = socket.user && socket.user._id ? socket.user._id.toString() : null;
  if (userId) {
    global.onlinePlayers.add(userId);
  }
  socket.on('disconnect', () => {
    if (userId) {
      global.onlinePlayers.delete(userId);
    }
  });
});

  return io;
}
