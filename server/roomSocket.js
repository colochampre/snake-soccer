import roomController from "../controllers/roomController.js";
import {
    createInitialState,
    addPlayer,
    spawnPlayer,
    removePlayer,
    startGame,
    handleDirectionChange,
    resumeAfterKickoff,
    resetBall
} from './gameLogic.js';

const roomIntervals = new Map();

function serializeGameState(state) {
    const players = {};
    for (const [id, p] of Object.entries(state.players)) {
        players[id] = {
            id: p.id,
            username: p.username,
            color: p.color,
            team: p.team,
            body: p.body,
            headbuttActive: p.headbuttActive > 0,
        };
    }
    return {
        players,
        ball: state.ball ? { x: state.ball.x, y: state.ball.y, size: state.ball.size } : null,
        score: state.score,
        timeLeft: state.timeLeft,
        kickOff: state.kickOff,
        isPausedForGoal: state.isPausedForGoal,
        goalScoredBy: state.goalScoredBy,
        goalScorerUsername: state.goalScorerUsername,
        goalAssisterUsername: state.goalAssisterUsername,
        isGameOver: state.isGameOver,
        winner: state.winner,
        mode: state.mode,
        teamNames: state.teamNames,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        goalHeight: state.goalHeight,
        fieldWidth: state.fieldWidth,
        fieldHeight: state.fieldHeight,
    };
}

function launchGame(roomId, room, io) {
    if (room.gameState && !room.gameState.isGameOver) return;

    const gameState = createInitialState(room.duration, room.mode, room.teamNames);

    if (room.mode === 'practica') {
        for (const lp of room.players.filter(p => p.role === 'player')) {
            addPlayer(gameState, lp.id, lp.username, null, lp.color);
        }
    } else {
        for (const lp of room.players.filter(p => p.team === 'team1')) {
            addPlayer(gameState, lp.id, lp.username, 'team1', lp.color);
        }
        for (const lp of room.players.filter(p => p.team === 'team2')) {
            addPlayer(gameState, lp.id, lp.username, 'team2', lp.color);
        }
    }

    // Set up starting positions for the preview during countdown
    resetBall(gameState);
    gameState.isPausedForGoal = true; // suppress 'TOCA EL BALÓN' hint

    const intervals = { game: null, timer: null };
    roomIntervals.set(roomId, intervals);
    roomController.updateRoomGameState(roomId, gameState);

    const onUpdate = (state) => io.to(roomId).emit('game-update', serializeGameState(state));

    const onEnd = (finalState) => {
        io.to(roomId).emit('game-over', {
            score: finalState.score,
            winner: finalState.winner,
            teamNames: finalState.teamNames,
            playerMatchStats: finalState.playerMatchStats,
        });
        const ri = roomIntervals.get(roomId);
        if (ri) {
            clearInterval(ri.game);
            clearInterval(ri.timer);
            roomIntervals.delete(roomId);
        }
    };

    const onGoalScored = () => {
        let c = 3;
        const tick = () => {
            io.to(roomId).emit('kickoff-countdown', { count: c });
            if (c === 0) {
                resumeAfterKickoff(gameState);
                return;
            }
            c--;
            setTimeout(tick, 1000);
        };
        tick();
    };

    // Emit game-starting and send initial positions preview
    io.to(roomId).emit('game-starting', {
        canvasWidth: gameState.canvasWidth,
        canvasHeight: gameState.canvasHeight,
        mode: gameState.mode,
    });
    onUpdate(gameState);

    // Pre-game countdown — starts the game loop only on GO
    let count = 3;
    const preGameTick = () => {
        io.to(roomId).emit('kickoff-countdown', { count });
        if (count === 0) {
            startGame(gameState, onUpdate, onEnd, onGoalScored, intervals);
            return;
        }
        count--;
        setTimeout(preGameTick, 1000);
    };
    preGameTick();
}

function getMinPlayersPerTeam(mode) {
    if (mode === '2vs2') return 2;
    if (mode === '3vs3') return 3;
    return 1;
}

function getMaxPlayersPerTeam(mode) {
    if (mode === '2vs2') return 2;
    if (mode === '3vs3') return 3;
    return 1;
}

function generateVibrantColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 65 + Math.floor(Math.random() * 35);
    const lightness = 45 + Math.floor(Math.random() * 25);
    const h = hue / 360, s = saturation / 100, l = lightness / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h * 12) % 12;
        return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function assignTeam(room) {
    if (room.mode === 'practica') return null;
    const t1 = room.players.filter(p => p.team === 'team1').length;
    const t2 = room.players.filter(p => p.team === 'team2').length;
    return t1 <= t2 ? 'team1' : 'team2';
}

function getTeamColor(team) {
    if (team === 'team1') return 'team1';
    if (team === 'team2') return 'team2';
    return 'default';
}

function canStartGame(room) {
    if (room.players.length === 0) return false;
    const allReady = room.players.every(p => p.isReady);
    if (!allReady) return false;
    if (room.mode === 'practica') return room.players.some(p => p.role === 'player');
    const min = getMinPlayersPerTeam(room.mode);
    const t1 = room.players.filter(p => p.team === 'team1').length;
    const t2 = room.players.filter(p => p.team === 'team2').length;
    return t1 >= min && t2 >= min;
}

export function setupRoomSocket(io) {
    function broadcastRoomList() {
        const rooms = roomController.getAllRooms();
        io.emit('rooms-updated', rooms);
    }

    io.on('connection', (socket) => {
        console.log('Usuario conectado:', socket.id);

        socket.emit('rooms-updated', roomController.getAllRooms());

        socket.on('join-room', ({ roomId, username }) => {
            const room = roomController.getRoomData(roomId);

            if (!room) {
                socket.emit('error', { message: 'Sala no encontrada', redirect: true });
                return;
            }

            let preservedTeam = undefined;
            let preservedRole = undefined;
            let oldPlayerId = undefined;
            const existingIndex = room.players.findIndex(p => p.username === username);
            if (existingIndex !== -1) {
                preservedTeam = room.players[existingIndex].team;
                preservedRole = room.players[existingIndex].role;
                oldPlayerId = room.players[existingIndex].id;
                room.players.splice(existingIndex, 1);
                
                if (room.gameState && oldPlayerId) {
                    removePlayer(room.gameState, oldPlayerId);
                }
            }

            socket.join(roomId);

            const team = preservedTeam !== undefined ? preservedTeam : assignTeam(room);
            const color = room.mode === 'practica' ? generateVibrantColor() : getTeamColor(team);
            const isReady = room.mode === 'practica';
            const role = preservedRole !== undefined ? preservedRole : 'player';
            const player = { id: socket.id, username, team, color, isReady, role };
            room.players.push(player);
            roomController.updateRoomPlayers(roomId, room.players);

            const canStart = canStartGame(room);
            socket.emit('room-joined', { player, players: room.players, room, canStart });
            socket.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });

            broadcastRoomList();
            console.log(`${player.username} se unió a la sala ${roomId} (${team || 'practica'})`);

            if (room.mode === 'practica' && room.gameState && !room.gameState.isGameOver) {
                addPlayer(room.gameState, player.id, player.username, null, player.color);
                spawnPlayer(room.gameState, player.id);
                socket.emit('game-starting', {
                    canvasWidth: room.gameState.canvasWidth,
                    canvasHeight: room.gameState.canvasHeight,
                    mode: room.gameState.mode,
                });
            } else if (canStart && !(room.gameState && !room.gameState.isGameOver)) {
                launchGame(roomId, room, io);
            }
        });

        socket.on('switch-team', ({ roomId }) => {
            const room = roomController.getRoomData(roomId);
            if (!room || room.gameState || room.mode === 'practica') return;

            const player = room.players.find(p => p.id === socket.id);
            if (!player || player.isReady) return;

            const targetTeam = player.team === 'team1' ? 'team2' : 'team1';
            const targetCount = room.players.filter(p => p.team === targetTeam).length;
            if (targetCount >= getMaxPlayersPerTeam(room.mode)) return;

            player.team = targetTeam;
            player.color = getTeamColor(targetTeam);
            roomController.updateRoomPlayers(roomId, room.players);

            const canStart = canStartGame(room);
            io.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });
        });

        socket.on('player-ready', ({ roomId }) => {
            const room = roomController.getRoomData(roomId);
            if (!room) return;

            const player = room.players.find(p => p.id === socket.id);
            if (!player) return;

            player.isReady = !player.isReady;
            roomController.updateRoomPlayers(roomId, room.players);

            const canStart = canStartGame(room);
            io.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });

            if (canStart) {
                launchGame(roomId, room, io);
            }
        });

        socket.on('leave-room', (roomId) => {
            const room = roomController.getRoomData(roomId);
            if (room) {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    room.players.splice(playerIndex, 1);
                    roomController.updateRoomPlayers(roomId, room.players);

                    if (room.gameState && room.gameState.players[socket.id]) {
                        removePlayer(room.gameState, socket.id);
                    }

                    const canStart = canStartGame(room);
                    socket.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });

                    if (room.players.length === 0) {
                        const ri = roomIntervals.get(roomId);
                        if (ri) {
                            clearInterval(ri.game);
                            clearInterval(ri.timer);
                            roomIntervals.delete(roomId);
                        }
                        roomController.deleteRoom(roomId);
                        console.log(`Sala ${roomId} eliminada (sin jugadores)`);
                    }

                    broadcastRoomList();
                }
            }
            socket.leave(roomId);
        });

        socket.on('player-move', ({ roomId, direction }) => {
            const room = roomController.getRoomData(roomId);
            if (room && room.gameState && !room.gameState.isGameOver) {
                handleDirectionChange(room.gameState, socket.id, direction);
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
                        room.players.splice(playerIndex, 1);
                        roomController.updateRoomPlayers(roomId, room.players);

                        if (room.gameState && room.gameState.players[socket.id]) {
                            removePlayer(room.gameState, socket.id);
                        }

                        const canStart = canStartGame(room);
                        io.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });

                        if (room.players.length === 0) {
                            const ri = roomIntervals.get(roomId);
                            if (ri) {
                                clearInterval(ri.game);
                                clearInterval(ri.timer);
                                roomIntervals.delete(roomId);
                            }
                            roomController.deleteRoom(roomId);
                        }

                        broadcastRoomList();
                    }
                }
            });
        });

        socket.on('restart-game', ({ roomId }) => {
            const room = roomController.getRoomData(roomId);
            if (!room) return;

            const ri = roomIntervals.get(roomId);
            if (ri) {
                clearInterval(ri.game);
                clearInterval(ri.timer);
                roomIntervals.delete(roomId);
            }

            room.players.forEach(p => { p.isReady = false; });
            roomController.updateRoomPlayers(roomId, room.players);
            roomController.updateRoomGameState(roomId, null);

            const canStart = canStartGame(room);
            io.to(roomId).emit('lobby-restored', { players: room.players, canStart, teamNames: room.teamNames });
        });

        socket.on('set-team-name', ({ roomId, team, name }) => {
            const room = roomController.getRoomData(roomId);
            if (!room || room.gameState || !['team1', 'team2'].includes(team)) return;

            const teamPlayers = room.players.filter(p => p.team === team);
            if (teamPlayers.length === 0 || teamPlayers[0].id !== socket.id) return;

            const cleanName = String(name).trim().slice(0, 20);
            if (!cleanName) return;

            roomController.updateTeamName(roomId, team, cleanName);

            const canStart = canStartGame(room);
            io.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });
        });
    });
}
