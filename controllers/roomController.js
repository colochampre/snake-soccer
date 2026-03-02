import crypto from "crypto";

const rooms = new Map();
let io = null;

function generateRoomId() {
    return crypto.randomBytes(3).toString('hex');
}

function broadcastRoomList() {
    if (io) {
        const allRooms = roomController.getAllRooms();
        io.emit('rooms-updated', allRooms);
    }
}

const roomController = {
    createRoom: async (req, res) => {
        try {
            const { private: isPrivate, duration, mode, ball } = req.body;
            const roomId = generateRoomId();
            const roomData = {
                id: roomId,
                private: isPrivate === 'on',
                duration: parseInt(duration) || 120,
                mode: mode || '1vs1',
                ball: ball || 'texture-1',
                createdAt: Date.now(),
                players: [],
                gameState: null
            };
            rooms.set(roomId, roomData);
            broadcastRoomList();
            res.redirect(`/room/${roomId}`);
        } catch (error) {
            error.c500(req, res, error);
        }
    },

    getRoom: async (req, res) => {
        try {
            const { id } = req.params;

            if (!rooms.has(id)) {
                return res.status(404).render('error', {
                    title: 'Sala no encontrada',
                    message: 'La sala que buscas no existe o ha expirado.',
                    error: { status: 404 }
                });
            }
            const room = rooms.get(id);
            res.render('room', {
                title: `Sala ${id}`,
                user: req.user,
                room: room
            });
        } catch (error) {
            error.c500(req, res, error);
        }
    },

    getRoomData: (roomId) => {
        return rooms.get(roomId);
    },

    deleteRoom: (roomId) => {
        rooms.delete(roomId);
    },

    updateRoomPlayers: (roomId, players) => {
        const room = rooms.get(roomId);
        if (room) {
            room.players = players;
            rooms.set(roomId, room);
        }
    },

    updateRoomGameState: (roomId, gameState) => {
        const room = rooms.get(roomId);
        if (room) {
            room.gameState = gameState;
            rooms.set(roomId, room);
        }
    },

    getAllRooms: () => {
        const allRooms = [];
        rooms.forEach((room, id) => {
            if (!room.private) {
                allRooms.push({
                    id: room.id,
                    mode: room.mode,
                    duration: room.duration,
                    ball: room.ball,
                    playerCount: room.players.length,
                    createdAt: room.createdAt
                });
            }
        });
        return allRooms;
    },

    setIO: (ioInstance) => {
        io = ioInstance;
    }
}

export default roomController;
