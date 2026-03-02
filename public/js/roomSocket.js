import roomController from "../../controllers/roomController.js";

export function setupRoomSocket(io) {
    io.on('connection', (socket) => {
        console.log('Usuario conectado:', socket.id);

        socket.on('join-room', ({ roomId, username }) => {
            const room = roomController.getRoomData(roomId);

            if (!room) {
                socket.emit('error', { message: 'Sala no encontrada', redirect: true });
                return;
            }

            const existingPlayerIndex = room.players.findIndex(p => p.username === username);
            if (existingPlayerIndex !== -1) {
                room.players.splice(existingPlayerIndex, 1);
            }

            socket.join(roomId);

            const player = { id: socket.id, username };
            room.players.push(player);
            roomController.updateRoomPlayers(roomId, room.players);

            socket.emit('room-joined', { player, players: room.players, room });
            socket.to(roomId).emit('player-joined', { username: player.username, players: room.players });

            console.log(`${player.username} se unió a la sala ${roomId}`);
        });

        socket.on('leave-room', (roomId) => {
            const room = roomController.getRoomData(roomId);
            if (room) {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const player = room.players[playerIndex];
                    room.players.splice(playerIndex, 1);
                    roomController.updateRoomPlayers(roomId, room.players);

                    socket.to(roomId).emit('player-left', { username: player.username, players: room.players });

                    if (room.players.length === 0) {
                        roomController.deleteRoom(roomId);
                        console.log(`Sala ${roomId} eliminada (sin jugadores)`);
                    }
                }
            }
            socket.leave(roomId);
        });

        socket.on('player-move', ({ roomId, direction }) => {
            const room = roomController.getRoomData(roomId);
            if (room) {
                io.to(roomId).emit('player-moved', { playerId: socket.id, direction });
            }
        });

        socket.on('disconnect', () => {
            console.log('Usuario desconectado:', socket.id);

            const rooms = io.sockets.adapter.rooms;
            rooms.forEach((_, roomId) => {
                const room = roomController.getRoomData(roomId);
                if (room) {
                    const playerIndex = room.players.findIndex(p => p.id === socket.id);
                    if (playerIndex !== -1) {
                        const player = room.players[playerIndex];
                        room.players.splice(playerIndex, 1);
                        roomController.updateRoomPlayers(roomId, room.players);

                        io.to(roomId).emit('player-left', { username: player.username, players: room.players });

                        if (room.players.length === 0) {
                            roomController.deleteRoom(roomId);
                        }
                    }
                }
            });
        });
    });
}
