import { db } from '../config/db.js';
import { TeenPattiService } from '../services/teenpatti.service.js';
import { StatsService } from '../services/stats.service.js';

export function handleTeenPattiSocket(teenpattiNamespace) {
  global.teenpattiNamespace = teenpattiNamespace;
  teenpattiNamespace.on('connection', (socket) => {
    const userId = socket.user?._id?.toString();
    console.log('TeenPatti Socket.IO client connected:', socket.id, 'User:', userId);

    if (userId) {
      global.onlineUsers.set(userId, socket.id);
      socket.join(userId);
      if (global.io) {
        StatsService.emitStatsUpdate(global.io).catch(err => console.error('STATS_EMIT_ERROR', err));
      }
    }

    // --- MATCHMAKING LOGIC ---
    socket.on('JOIN_TP_QUEUE', async (data) => {
      try {
        const { entryFee, variant } = data;
        console.log(`JOIN_TP_QUEUE received for ${userId}: ${variant} ${entryFee}`);
        const game = await TeenPattiService.matchmaking(socket.user, variant, entryFee);
        
        // Join the room FIRST so this player receives all subsequent events
        socket.join(game.matchId);

        if (game._readyToStart) {
          // Both players are now in the room — safe to start
          delete game._readyToStart;
          TeenPattiService.startGame(game.matchId);
        } else if (game.status === 'MATCHMAKING') {
          socket.emit('TP_QUEUE_UPDATE', { status: 'WAITING', game });
        }
        // If status is already PLAYING (user re-joined), GAME_UPDATE is sent by startGame
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('CANCEL_TP_QUEUE', async () => {
      try {
        const result = await TeenPattiService.cancelMatchmaking(socket.user);
        socket.emit('TP_QUEUE_CANCELLED', result);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });
    // -------------------------

    socket.on('JOIN_GAME', (data) => {
      const { matchId } = data;
      console.log('JOIN_GAME_TP_RECEIVED', userId, matchId);
      socket.join(matchId);

      const game = db.teenPattiGames.get(matchId);
      if (!game) {
        console.warn("JOIN_GAME TP: game not found for", matchId);
        return;
      }

      const room = teenpattiNamespace.adapter.rooms.get(matchId);
      const roomSize = room ? room.size : 0;
      const bothPlayersJoined = roomSize >= 2;

      console.log('TP_ROOM_SIZE', matchId, roomSize, bothPlayersJoined);

      teenpattiNamespace.to(matchId).emit('PLAYER_JOINED', {
        userId,
        username: socket.user.username,
        players: game.players
      });

      socket.emit('GAME_UPDATE', game);
    });

    socket.on('SEE_CARDS', async (data) => {
      const { matchId } = data;
      try {
        const game = TeenPattiService.seen(matchId, socket.user);
        teenpattiNamespace.to(matchId).emit('PLAYER_ACTION', {
          action: 'SEE_CARDS',
          userId,
          username: socket.user.username
        });
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('PLACE_BET', async (data) => {
      const { matchId } = data;
      try {
        const game = await TeenPattiService.chaal(matchId, socket.user);
        const isA = game.players.A.userId === userId;
        const player = isA ? game.players.A : game.players.B;
        teenpattiNamespace.to(matchId).emit('PLACE_BET', {
          userId,
          username: socket.user.username,
          betSize: player?.lastBet || 0,
          pot: game.pot
        });
        teenpattiNamespace.to(matchId).emit('TURN_CHANGED', { turn: game.turn });
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('PACK', async (data) => {
      const { matchId } = data;
      try {
        const game = await TeenPattiService.fold(matchId, socket.user);
        teenpattiNamespace.to(matchId).emit('PLAYER_ACTION', {
          action: 'PACK',
          userId,
          username: socket.user.username
        });
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('SHOW', async (data) => {
      const { matchId } = data;
      try {
        const game = await TeenPattiService.show(matchId, socket.user);
        teenpattiNamespace.to(matchId).emit('PLAYER_ACTION', {
          action: 'SHOW',
          userId,
          username: socket.user.username
        });
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('SIDE_SHOW_REQUEST', async (data) => {
      const { matchId } = data;
      try {
        const game = await TeenPattiService.requestSideShow(matchId, socket.user);
        teenpattiNamespace.to(matchId).emit('PLAYER_ACTION', {
          action: 'SIDE_SHOW_REQUEST',
          userId,
          username: socket.user.username
        });
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('SIDE_SHOW_RESPOND', async (data) => {
      const { matchId, accept } = data;
      try {
        const game = await TeenPattiService.respondSideShow(matchId, socket.user, accept);
        teenpattiNamespace.to(matchId).emit('PLAYER_ACTION', {
          action: accept ? 'SIDE_SHOW_ACCEPT' : 'SIDE_SHOW_REJECT',
          userId,
          username: socket.user.username
        });
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      } catch (err) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('CHAT_MESSAGE', (data) => {
      const { matchId, message } = data;
      console.log('TP CHAT MESSAGE RECEIVED', matchId, message);
      teenpattiNamespace.to(matchId).emit('CHAT_MESSAGE', {
        sender: socket.user.username,
        userId,
        text: message
      });
    });

    socket.on('EMOJI_REACTION', (data) => {
      const { matchId, emoji } = data;
      console.log('TP EMOJI REACTION RECEIVED', matchId, emoji);
      teenpattiNamespace.to(matchId).emit('EMOJI_REACTION', {
        sender: socket.user.username,
        userId,
        emoji
      });
    });

    socket.on('disconnect', () => {
      console.log('TeenPatti Socket client disconnected:', socket.id);
      if (userId) {
        global.onlineUsers.delete(userId);
      }
      if (userId && global.io) {
        StatsService.emitStatsUpdate(global.io).catch(err => console.error('STATS_EMIT_ERROR', err));
      }
    });
  });
}
