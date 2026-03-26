import roomController from "../controllers/roomController.js";
import playerStatsModel from "../models/playerStatsModel.js";
import userModel from "../models/userModel.js";
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

// XP rewards configuration
const XP_REWARDS = {
    WIN: 100,
    DRAW: 50,
    LOSS: 25,
    GOAL: 20,
    ASSIST: 10
};

async function saveMatchStats(finalState, room) {
    try {
        const { playerMatchStats, winner, teams } = finalState;
        
        for (const [playerId, matchStats] of Object.entries(playerMatchStats)) {
            const { username, goals, assists } = matchStats;
            
            // Get user from database
            const user = await userModel.findByUsername(username);
            if (!user) continue;
            
            // Determine win/loss/draw for this player
            const playerTeam = teams.team1.includes(playerId) ? 'team1' : 'team2';
            const isWin = winner === playerTeam;
            const isDraw = winner === 'draw';
            const isLoss = !isWin && !isDraw;
            
            // Calculate XP gained
            let xpGained = 0;
            if (isWin) xpGained += XP_REWARDS.WIN;
            else if (isDraw) xpGained += XP_REWARDS.DRAW;
            else xpGained += XP_REWARDS.LOSS;
            
            xpGained += goals * XP_REWARDS.GOAL;
            xpGained += assists * XP_REWARDS.ASSIST;
            
            // Update stats in database
            await playerStatsModel.updateStats(user.id, {
                goals,
                assists,
                isWin,
                isLoss,
                isDraw,
                xpGained
            });
            
            console.log(`Stats saved for ${username}: goals=${goals}, assists=${assists}, xp=${xpGained}`);
        }
    } catch (error) {
        console.error('Error saving match stats:', error);
    }
}

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
        ball: state.ball ? { x: state.ball.x, y: state.ball.y, vx: state.ball.vx || 0, vy: state.ball.vy || 0, size: state.ball.size, spin: state.ball.spin || 0 } : null,
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

    const onUpdate = (state, soundEvents = []) => {
        io.to(roomId).emit('game-update', serializeGameState(state));
        if (soundEvents.length > 0) {
            io.to(roomId).emit('sound-events', soundEvents);
        }
    };

    const onEnd = async (finalState) => {
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

        // Save stats to database (skip practice mode)
        if (room.mode !== 'practica') {
            await saveMatchStats(finalState, room);
        }
    };

    const onGoalScored = (onCountdownPause) => {
        let c = 3;
        const tick = () => {
            io.to(roomId).emit('kickoff-countdown', { count: c });
            // Play beep on 3, 2, 1 (not on GO)
            if (c > 0) {
                io.to(roomId).emit('sound-events', [{ type: 'beep' }]);
            }
            if (c === 0) {
                // Play whistle sound on GO
                io.to(roomId).emit('sound-events', [{ type: 'whistle' }]);
                resumeAfterKickoff(gameState);
                // Resume countdown sound after kickoff if it was paused
                if (gameState.countdownActive && onCountdownPause) {
                    onCountdownPause({ action: 'resume' });
                }
                return;
            }
            c--;
            setTimeout(tick, 1000);
        };
        tick();
    };

    const onCountdown = ({ isDramatic }) => {
        io.to(roomId).emit('sound-events', [{
            type: 'countdown',
            isDramatic
        }]);
    };

    const onCountdownPause = ({ action }) => {
        io.to(roomId).emit('sound-events', [{
            type: 'countdownControl',
            action
        }]);
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
        // Play beep on 3, 2, 1 (not on GO)
        if (count > 0) {
            io.to(roomId).emit('sound-events', [{ type: 'beep' }]);
        }
        if (count === 0) {
            // Play whistle sound on GO
            io.to(roomId).emit('sound-events', [{ type: 'whistle' }]);
            startGame(gameState, onUpdate, onEnd, onGoalScored, intervals, onCountdown, onCountdownPause);
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
            socket.emit('room-joined', { 
                player, 
                players: room.players, 
                room, 
                canStart,
                p2pGameActive: room.useP2P && room.p2pGameActive,
                hostId: room.players[0]?.id
            });
            socket.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });

            broadcastRoomList();
            console.log(`${player.username} se unió a la sala ${roomId} (${team || 'practica'})`);

            // If P2P game is already active, add player to existing game
            if (room.useP2P && room.p2pGameActive) {
                // Notify the new player to join the existing P2P game
                socket.emit('p2p-join-active-game', {
                    hostId: room.players[0]?.id,
                    players: room.players,
                    roomConfig: {
                        duration: room.duration,
                        mode: room.mode,
                        teamNames: room.teamNames
                    }
                });
            } else if (room.gameState && !room.gameState.isGameOver) {
                // Server-side game active
                const forcedTeam = room.mode !== 'practica' ? player.team : null;
                addPlayer(room.gameState, player.id, player.username, forcedTeam, player.color);
                spawnPlayer(room.gameState, player.id);
                socket.emit('game-starting', {
                    canvasWidth: room.gameState.canvasWidth,
                    canvasHeight: room.gameState.canvasHeight,
                    mode: room.gameState.mode,
                });
            } else if (canStart) {
                // Start game - handle P2P mode
                const startGame = () => {
                    if (room.useP2P) {
                        const hostId = room.players[0]?.id;
                        if (hostId) {
                            room.p2pGameActive = true;
                            room.p2pHostId = hostId; // Track the original host
                            io.to(roomId).emit('p2p-start-game', {
                                hostId,
                                players: room.players,
                                roomConfig: {
                                    duration: room.duration,
                                    mode: room.mode,
                                    teamNames: room.teamNames
                                }
                            });
                        }
                    } else {
                        launchGame(roomId, room, io);
                    }
                };

                // In practice mode, add 1 second delay for auto-start
                if (room.mode === 'practica') {
                    setTimeout(startGame, 1000);
                } else {
                    startGame();
                }
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

            // If P2P game is already active, don't allow ready toggle - just add player to game
            if (room.useP2P && room.p2pGameActive) {
                // Player is joining an active game, send them to join
                socket.emit('p2p-join-active-game', {
                    hostId: room.players[0]?.id,
                    players: room.players,
                    roomConfig: {
                        duration: room.duration,
                        mode: room.mode,
                        teamNames: room.teamNames
                    }
                });
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) return;

            player.isReady = !player.isReady;
            roomController.updateRoomPlayers(roomId, room.players);

            const canStart = canStartGame(room);
            io.to(roomId).emit('lobby-updated', { players: room.players, canStart, teamNames: room.teamNames });

            if (canStart) {
                if (room.useP2P) {
                    // En modo P2P, notificar al host para que inicie el juego
                    const hostId = room.players[0]?.id;
                    if (hostId) {
                        room.p2pGameActive = true;
                        room.p2pHostId = hostId; // Track the original host
                        io.to(roomId).emit('p2p-start-game', {
                            hostId,
                            players: room.players,
                            roomConfig: {
                                duration: room.duration,
                                mode: room.mode,
                                teamNames: room.teamNames
                            }
                        });
                    }
                } else {
                    launchGame(roomId, room, io);
                }
            }
        });

        socket.on('leave-room', (roomId) => {
            const room = roomController.getRoomData(roomId);
            if (room) {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const wasHost = playerIndex === 0;
                    
                    room.players.splice(playerIndex, 1);
                    roomController.updateRoomPlayers(roomId, room.players);

                    if (room.gameState && room.gameState.players[socket.id]) {
                        removePlayer(room.gameState, socket.id);
                    }

                    // In P2P mode during active game
                    if (room.useP2P && room.p2pGameActive) {
                        const wasP2PHost = socket.id === room.p2pHostId;
                        if (wasP2PHost) {
                            // Host left - close the room and kick all players
                            room.p2pGameActive = false;
                            room.p2pHostId = null;
                            socket.to(roomId).emit('p2p-room-closed', {
                                reason: 'El host se ha desconectado. La sala ha sido cerrada.'
                            });
                            // Clear all remaining players and delete room
                            room.players = [];
                            roomController.deleteRoom(roomId);
                            broadcastRoomList();
                            socket.leave(roomId);
                            return; // Exit early, room is deleted
                        } else {
                            // Client left, just notify host to remove their snake
                            socket.to(roomId).emit('p2p-player-left', {
                                playerId: socket.id
                            });
                        }
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
                        const wasHost = playerIndex === 0;
                        
                        room.players.splice(playerIndex, 1);
                        roomController.updateRoomPlayers(roomId, room.players);

                        if (room.gameState && room.gameState.players[socket.id]) {
                            removePlayer(room.gameState, socket.id);
                        }

                        // In P2P mode during active game
                        if (room.useP2P && room.p2pGameActive) {
                            const wasP2PHost = socket.id === room.p2pHostId;
                            if (wasP2PHost) {
                                // Host disconnected - close the room and kick all players
                                room.p2pGameActive = false;
                                room.p2pHostId = null;
                                io.to(roomId).emit('p2p-room-closed', {
                                    reason: 'El host se ha desconectado. La sala ha sido cerrada.'
                                });
                                // Clear all remaining players and delete room
                                room.players = [];
                                roomController.deleteRoom(roomId);
                                broadcastRoomList();
                                return; // Exit early, room is deleted
                            } else {
                                // Client disconnected, just notify host to remove their snake
                                io.to(roomId).emit('p2p-player-left', {
                                    playerId: socket.id
                                });
                            }
                        }

                        // Notify peers about disconnection for WebRTC cleanup
                        io.to(roomId).emit('peer-disconnected', { peerId: socket.id });

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

        // === WebRTC Signaling for P2P ===
        
        // Client requests P2P connection to host
        socket.on('rtc-request-connection', ({ roomId, hostId, username }) => {
            console.log(`[WebRTC] ${username} requesting P2P connection to host ${hostId}`);
            io.to(hostId).emit('rtc-request-connection', {
                peerId: socket.id,
                username
            });
        });

        // Host sends offer to peer
        socket.on('rtc-offer', ({ targetId, offer }) => {
            io.to(targetId).emit('rtc-offer', {
                fromId: socket.id,
                offer
            });
        });

        // Peer sends answer to host
        socket.on('rtc-answer', ({ targetId, answer }) => {
            io.to(targetId).emit('rtc-answer', {
                fromId: socket.id,
                answer
            });
        });

        // ICE candidate exchange
        socket.on('rtc-ice-candidate', ({ targetId, candidate }) => {
            io.to(targetId).emit('rtc-ice-candidate', {
                fromId: socket.id,
                candidate
            });
        });

        // P2P game over - save stats via server
        socket.on('p2p-game-over', async ({ roomId, finalState }) => {
            const room = roomController.getRoomData(roomId);
            if (!room) return;
            
            // Mark P2P game as inactive
            room.p2pGameActive = false;
            room.p2pHostId = null;
            
            if (room.mode === 'practica') return;

            // Reconstruct teams from room players
            const teams = {
                team1: room.players.filter(p => p.team === 'team1').map(p => p.id),
                team2: room.players.filter(p => p.team === 'team2').map(p => p.id)
            };

            await saveMatchStats({
                ...finalState,
                teams
            }, room);
        });
    });
}
