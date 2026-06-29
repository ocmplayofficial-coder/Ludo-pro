import { db } from '../config/db.js';
import { UserModel } from '../models/user.model.js';
import { LudoService } from '../services/ludo.service.js';

export function handleLudoSocket(ludoNamespace) {
  ludoNamespace.on('connection', (socket) => {
    const userId = socket.user?._id?.toString();
    console.log('Ludo Socket.IO client connected:', socket.id, 'User:', userId);
    if (userId) {
      socket.join(userId);
      console.log(`Ludo client ${socket.id} joined personal room ${userId}`);
    }

    socket.on('JOIN_GAME', (data) => {
      const { matchId } = data;
      const socketUserId = socket.user?._id?.toString();
      console.log('JOIN_GAME_RECEIVED', { socketId: socket.id, socketUserId, matchId });

      if (!matchId) {
        console.warn('JOIN_GAME: no matchId provided', { socketId: socket.id, socketUserId, data });
        return;
      }

      socket.join(matchId);
      console.log("SOCKET_JOINED", { socketId: socket.id, matchId });

      const roomAfterJoin = ludoNamespace.adapter.rooms.get(matchId);
      console.log('ROOM_AFTER_JOIN', { matchId, members: roomAfterJoin ? [...roomAfterJoin] : [] });

      const game = db.ludoGames.get(matchId);
      if (!game) {
        console.warn("JOIN_GAME: game not found for", { matchId, socketId: socket.id, socketUserId });
        return;
      }

      // Compute player color for this socket and opponent
      const redId = game.players?.red?.userId ? game.players.red.userId.toString() : null;
      const yellowId = game.players?.yellow?.userId ? game.players.yellow.userId.toString() : null;
      const socketUserId = socket.user?._id?.toString();
      const playerColor = (socketUserId === redId) ? 'red' : 'yellow';
      socket.data.playerColor = playerColor;

      const opponent = playerColor === 'red' ? game.players.yellow : game.players.red;
      console.log('PLAYER_COLOR', { socketId: socket.id, playerColor });
      console.log('OPPONENT_SELECTED', { socketId: socket.id, opponent });
      // Log room size for debugging
      const room = ludoNamespace.adapter.rooms.get(matchId);
      console.log('ROOM_SIZE', matchId, room ? room.size : 0);

      // Determine if both player slots are filled based on actual room membership
      const roomAfter = ludoNamespace.adapter.rooms.get(matchId);
      const roomSize = roomAfter ? roomAfter.size : 0;
      // Use room membership as the authoritative indicator that two clients are present
      const bothPlayersJoined = roomSize >= 2;
      // Store a room-derived joined flag on the game for server-side logic
      game.bothPlayersJoined = bothPlayersJoined;
      console.log("PLAYERS_JOINED_STATUS", { matchId, bothPlayersJoined, roomSize });

      // Notify room that a player joined
      const joinedPayload = {
        playerId: socketUserId,
        players: game.players,
        roomId: matchId
      };
      console.log('EMITTING TO ROOM (PLAYER_JOINED)', matchId);
      const roomBeforeEmit = ludoNamespace.adapter.rooms.get(matchId);
      console.log('ROOM_MEMBERS', matchId, roomBeforeEmit ? [...roomBeforeEmit] : []);
      ludoNamespace.to(matchId).emit('PLAYER_JOINED', joinedPayload);
      console.log('PLAYER_JOINED_EMITTED', { matchId, payload: joinedPayload });

      // Also send the joining socket an immediate sync in case it missed prior broadcasts
      try {
        socket.emit('PLAYER_JOINED', joinedPayload);
        socket.emit('GAME_UPDATE', game);
        socket.emit('MATCH_FOUND', { roomId: matchId, players: game.players });
        console.log('DIRECT_EMITS_TO_JOINER_SENT', { socketId: socket.id, matchId });
      } catch (err) {
        console.warn('Failed direct emit to joiner', err);
      }

      // Log game status for diagnostics
      console.log('GAME_STATUS', { matchId, status: game.status });

      // Log game state before attempting to start
      console.log('GAME_STATE', {
        status: game.status,
        waitingForPlayers: game.waitingForPlayers,
        started: game.started,
        bothPlayersJoined
      });

      // If both players are present and the game is pending, transition to PLAYING and emit start events
      if (bothPlayersJoined && (game.status === 'PLAYING_PENDING' || game.waitingForPlayers)) {
        game.status = 'PLAYING';
        game.waitingForPlayers = false;
        game.started = true;
        game.timerRemaining = 300;
        game.turnTimerRemaining = 18;
        
        // Start server authoritative game timer loop
        LudoService.startGameTimer(game.matchId);

        // Prepare concise game start payload per requirement
        const startPayload = {
          currentTurn: game.turn,
          currentPlayerId: (game.turn === 'red' ? redId : yellowId),
          players: game.players,
          roomId: game.matchId
        };

        console.log("GAME_READY", { matchId: game.matchId });
        console.log('EMITTING TO ROOM (MATCH_FOUND)', matchId);
        const roomBeforeMatchFound = ludoNamespace.adapter.rooms.get(matchId);
        console.log('ROOM_MEMBERS', matchId, roomBeforeMatchFound ? [...roomBeforeMatchFound] : []);
        ludoNamespace.to(matchId).emit('MATCH_FOUND', { roomId: matchId, players: game.players });
        console.log('MATCH_FOUND_EMITTED', { matchId });
        console.log("TURN_ASSIGNED", { matchId: game.matchId, currentTurn: game.turn, currentPlayerId: startPayload.currentPlayerId });

        // Emit GAME_STARTED and a full GAME_UPDATE to the room (order intentionally maintained)
        console.log('EMITTING TO ROOM (GAME_STARTED)', matchId);
        ludoNamespace.to(matchId).emit('GAME_STARTED', startPayload);
        console.log('EMITTING TO ROOM (GAME_UPDATE)', matchId);
        ludoNamespace.to(matchId).emit('GAME_UPDATE', game);
        console.log('GAME_UPDATE_SENT', { matchId: game.matchId, type: 'GAME_STARTED/GAME_UPDATE' });
      } else {
        // Player joined after game already started or after both players were present
        // Ensure the early joiner receives opponent info
        console.log('EMITTING TO ROOM (MATCH_FOUND) (late joiner)', matchId);
        const roomBeforeLateMatchFound = ludoNamespace.adapter.rooms.get(matchId);
        console.log('ROOM_MEMBERS', matchId, roomBeforeLateMatchFound ? [...roomBeforeLateMatchFound] : []);
        ludoNamespace.to(matchId).emit('MATCH_FOUND', { roomId: matchId, players: game.players });
        console.log('MATCH_FOUND_EMITTED (late joiner)', { matchId });
        // Still waiting for opponent — emit only GAME_UPDATE (pending)
        console.log('EMITTING TO ROOM (GAME_UPDATE) (pending)', matchId);
        ludoNamespace.to(matchId).emit('GAME_UPDATE', game);
        console.log('GAME_UPDATE_SENT', { matchId: game.matchId, type: 'PENDING_GAME_UPDATE' });
      }
    });

    socket.on('ROLL', async (data) => {
      console.log("SERVER_RECEIVED", Date.now());
      const { matchId } = data;
      console.log('ROLL_DICE_RECEIVED', { matchId, socketId: socket.id, user: socket.user?._id });
      try {
        const game = db.ludoGames.get(matchId);
        if (!game) {
          console.log('ROLL: game not found', { matchId });
          return;
        }
        if (game.status !== 'PLAYING') {
          console.log('ROLL: game not in PLAYING state', { matchId, status: game.status });
          return;
        }
        if (game.diceHasRolled) {
          console.log('ROLL: dice already rolled', { matchId });
          return;
        }

        // Validate socket user owns current turn
        const socketUserId = socket.user?._id?.toString();
        const turnUserId = game.turn === 'red' 
          ? game.players.red?.userId?.toString() 
          : game.players.yellow?.userId?.toString();

        if (socketUserId !== turnUserId) {
          console.warn(`Unauthenticated ROLL request by ${socketUserId} on turn ${turnUserId}`);
          return;
        }

        await LudoService.roll(matchId, socket.user);
        console.log("RESULT_SENT", Date.now());
      } catch (err) {
        console.error("Socket ROLL error:", err);
      }
    });

    socket.on('MOVE', async (data) => {
      const { matchId, tokenId } = data;
      console.log('MOVE_TOKEN_RECEIVED', { matchId, tokenId, socketId: socket.id, user: socket.user?._id });
      try {
        const game = db.ludoGames.get(matchId);
        if (!game) {
          console.log('MOVE: game not found', { matchId });
          return;
        }
        if (game.status !== 'PLAYING') {
          console.log('MOVE: game not in PLAYING state', { matchId, status: game.status });
          return;
        }
        if (!game.diceHasRolled || game.diceRoll === null) {
          console.log('MOVE: dice not rolled', { matchId });
          return;
        }

        // Validate socket user owns current turn
        const socketUserId = socket.user?._id?.toString();
        const turnUserId = game.turn === 'red' 
          ? game.players.red?.userId?.toString() 
          : game.players.yellow?.userId?.toString();

        if (socketUserId !== turnUserId) {
          console.warn(`Unauthenticated MOVE request by ${socketUserId} on turn ${turnUserId}`);
          return;
        }

        await LudoService.move(matchId, socket.user, tokenId);

        if (game.status === 'FINISHED') {
          ludoNamespace.to(matchId).emit('GAME_ENDED', { roomId: matchId, winner: game.winner });
          ludoNamespace.to(matchId).emit('WINNER_DECLARED', { winner: game.winner, prize: game.winningPrize, roomId: matchId });
        }
      } catch (err) {
        console.error("Socket MOVE error:", err);
      }
    });

    socket.on('TIMEOUT', async (data) => {
      const { matchId } = data;
      console.log('TIMEOUT_RECEIVED', { matchId, socketId: socket.id, user: socket.user?._id });
      try {
        const game = db.ludoGames.get(matchId);
        if (!game || game.status !== 'PLAYING') return;

        // Validate socket user owns current turn
        const socketUserId = socket.user?._id?.toString();
        const turnUserId = game.turn === 'red' 
          ? game.players.red?.userId?.toString() 
          : game.players.yellow?.userId?.toString();

        if (socketUserId !== turnUserId) {
          console.warn(`Unauthenticated TIMEOUT request by ${socketUserId} on turn ${turnUserId}`);
          return;
        }

        await LudoService.timeout(matchId, socket.user);

        if (game.status === 'FINISHED') {
          ludoNamespace.to(matchId).emit('GAME_ENDED', { roomId: matchId, winner: game.winner });
          ludoNamespace.to(matchId).emit('WINNER_DECLARED', { winner: game.winner, prize: game.winningPrize, roomId: matchId });
        }
      } catch (err) {
        console.error("Socket TIMEOUT error:", err);
      }
    });

    socket.on('LEAVE_GAME', async (data) => {
      const { matchId } = data;
      console.log('LEAVE_GAME_RECEIVED', { matchId, socketId: socket.id, user: socket.user?._id });
      try {
        const game = db.ludoGames.get(matchId);
        if (!game || game.status === 'FINISHED') return;

        await LudoService.leave(matchId, socket.user);

        ludoNamespace.to(matchId).emit('GAME_ENDED', { roomId: matchId, winner: game.winner });
        ludoNamespace.to(matchId).emit('WINNER_DECLARED', { winner: game.winner, prize: game.winningPrize, roomId: matchId });
        ludoNamespace.to(matchId).emit('PLAYER_LEFT', { playerId: socket.user?._id?.toString(), roomId: matchId });
        
        socket.leave(matchId);
        console.log('SOCKET_LEFT_ROOM', { socketId: socket.id, matchId });
      } catch (err) {
        console.error("Socket LEAVE_GAME error:", err);
      }
    });

    socket.on('disconnect', () => {
      console.log('Ludo client disconnected:', socket.id);
    });
  });
}
