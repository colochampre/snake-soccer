import crypto from "crypto";

const rooms = new Map();
let io = null;

function generateRoomId() {
    return crypto.randomBytes(3).toString('hex');
}

function getMaxPlayers(mode) {
    switch(mode) {
        case '1vs1':
            return 2;
        case '2vs2':
            return 4;
        case '3vs3':
            return 6;
        case 'practica':
            return null;
        default:
            return 2;
    }
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
            const { private: isPrivate, duration, mode, ball, hostCountry } = req.body;
            const roomId = generateRoomId();
            const roomData = {
                id: roomId,
                private: isPrivate === 'on',
                duration: parseInt(duration) || 120,
                mode: mode || '1vs1',
                ball: ball || 'texture-1',
                hostCountry: hostCountry || null,
                createdAt: Date.now(),
                players: [],
                teamNames: { team1: 'Equipo A', team2: 'Equipo B' },
                gameState: null,
                useP2P: true
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
                const reason = req.query.reason;
                return res.status(404).render('error', {
                    title: 'Sala no encontrada',
                    message: reason || 'La sala que buscas no existe o ha expirado.',
                    error: { status: 404 }
                });
            }
            const room = rooms.get(id);
            
            const maxPlayers = getMaxPlayers(room.mode);
            const existingPlayer = room.players.find(p => p.username === req.user.username);
            
            if (maxPlayers !== null && room.players.length >= maxPlayers && !existingPlayer) {
                return res.status(403).render('error', {
                    title: 'Sala llena',
                    message: 'Esta sala ya alcanzó su capacidad máxima de jugadores.',
                    error: { status: 403 }
                });
            }
            
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

    updateTeamName: (roomId, team, name) => {
        const room = rooms.get(roomId);
        if (room && room.teamNames) {
            room.teamNames[team] = name;
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
                    hostCountry: room.hostCountry,
                    playerCount: room.players.length,
                    maxPlayers: getMaxPlayers(room.mode),
                    createdAt: room.createdAt
                });
            }
        });
        return allRooms;
    },

    getMaxPlayers: getMaxPlayers,

    setIO: (ioInstance) => {
        io = ioInstance;
    }
}

export default roomController;
