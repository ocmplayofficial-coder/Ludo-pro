import { db } from '../config/db.js';
import { TeenPattiService } from '../services/teenpatti.service.js';

export function handleTeenPattiSocket(teenpattiNamespace) {
  teenpattiNamespace.on('connection', (socket) => {
    const userId = socket.user?._id?.toString();
    console.log('TeenPatti Socket.IO client connected:', socket.id, 'User:', userId);

    if (userId) {
      socket.join(userId);
    }

    socket.on('JOIN_GAME', (data) => {
      const { matchId } = data;
      console.log('JOIN_GAME_TP_RECEIVED', userId, matchId);
      socket.join(matchId);

      const game = db.teenPattiGames.get(matchId);
      if (!game) {
        console.warn("JOIN_GAME TP: game not found for", matchId);
        return;
      }

      // Check if both players joined
      const room = teenpattiNamespace.adapter.rooms.get(matchId);
      const roomSize = room ? room.size : 0;
      const bothPlayersJoined = roomSize >= 2;

      console.log('TP_ROOM_SIZE', matchId, roomSize, bothPlayersJoined);

      // Notify player joined
      teenpattiNamespace.to(matchId).emit('PLAYER_JOINED', {
        userId,
        username: socket.user.username,
        players: game.players
      });

      // Send immediate sync to this user
      socket.emit('GAME_UPDATE', game);

      if (bothPlayersJoined && game.status === 'PLAYING_PENDING') {
        game.status = 'PLAYING';
        game.waitingForPlayers = false;
        game.started = true;
        game.turnTimerRemaining = 15;

        // Start countdown loop
        TeenPattiService.startTPGameTimer(matchId);

        console.log("TP_GAME_READY", { matchId });

        // Emit matchmaking and game start notifications
        teenpattiNamespace.to(matchId).emit('MATCH_FOUND', { roomId: matchId, players: game.players });
        teenpattiNamespace.to(matchId).emit('GAME_START', { roomId: matchId, turn: game.turn });
        
        // Deal cards event with dealing anim hook
        teenpattiNamespace.to(matchId).emit('CARD_DEALT', { matchId });
        
        // Send updated game states
        teenpattiNamespace.to(matchId).emit('GAME_UPDATE', game);
      }
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
        teenpattiNamespace.to(matchId).emit('PLACE_BET', {
          userId,
          username: socket.user.username,
          betSize: game.players.A.userId === userId ? game.players.A.lastBet : game.players.B.lastBet,
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
    });
  });
}
