// P2P Host Game Manager
// Runs game logic locally and broadcasts state to connected peers

import { PeerConnection } from './PeerConnection.js';
import {
    createInitialState,
    addPlayer,
    spawnPlayer,
    removePlayer,
    startGame,
    handleDirectionChange,
    resumeAfterKickoff,
    resetBall,
    serializeGameState
} from './gameLogic.client.js';

export class HostGame {
    constructor(socket, roomId, roomConfig, lobbyPlayers) {
        this.socket = socket;
        this.roomId = roomId;
        this.roomConfig = roomConfig;
        this.lobbyPlayers = lobbyPlayers;
        this.peers = new Map(); // peerId -> PeerConnection
        this.gameState = null;
        this.intervals = null;
        this.isRunning = false;
        this.myPlayerId = socket.id;

        // Callbacks for UI
        this.onGameUpdate = null;
        this.onSoundEvents = null;
        this.onGameOver = null;
        this.onKickoffCountdown = null;
        this.onLatencyUpdate = null;

        this._setupSignaling();
    }

    _setupSignaling() {
        // When a new peer wants to connect
        this.socket.on('rtc-request-connection', async ({ peerId, username }) => {
            console.log(`[Host] Connection request from ${username} (${peerId})`);
            await this._createPeerConnection(peerId, username);
            
            // If game is running, add the new player to the game state
            if (this.isRunning && this.gameState && !this.gameState.players[peerId]) {
                const mode = this.gameState.mode;
                // Find player info from lobby
                const playerInfo = this.lobbyPlayers.find(p => p.id === peerId);
                const forcedTeam = mode !== 'practica' ? playerInfo?.team : null;
                const color = playerInfo?.color || '#ffffff';
                addPlayer(this.gameState, peerId, username, forcedTeam, color);
                spawnPlayer(this.gameState, peerId);
                console.log(`[Host] Added late-joining player ${username} to game`);
            }
        });

        this.socket.on('rtc-answer', async ({ fromId, answer }) => {
            const peer = this.peers.get(fromId);
            if (peer) {
                await peer.handleAnswer(answer);
            }
        });

        this.socket.on('rtc-ice-candidate', async ({ fromId, candidate }) => {
            const peer = this.peers.get(fromId);
            if (peer) {
                await peer.handleIceCandidate(candidate);
            }
        });

        // Handle peer disconnection via server
        this.socket.on('peer-disconnected', ({ peerId }) => {
            this._removePeer(peerId);
        });
    }

    async _createPeerConnection(peerId, username) {
        const peer = new PeerConnection(this.socket, peerId, true);
        
        peer.onMessage = (data) => this._handlePeerMessage(peerId, data);
        
        peer.onConnected = () => {
            console.log(`[Host] Peer ${peerId} connected via P2P`);
        };

        peer.onDataChannelOpen = () => {
            console.log(`[Host] DataChannel ready for ${peerId}, sending game-starting`);
            // Send game-starting to initialize client canvas and render loop
            if (this.gameState) {
                peer.send({
                    type: 'game-starting',
                    canvasWidth: this.gameState.canvasWidth,
                    canvasHeight: this.gameState.canvasHeight,
                    mode: this.gameState.mode
                });
            }
            // If game is running, send current state
            if (this.isRunning && this.gameState) {
                peer.send({
                    type: 'game-state-sync',
                    state: serializeGameState(this.gameState)
                });
            }
        };

        peer.onDisconnected = () => {
            console.log(`[Host] Peer ${peerId} disconnected`);
            this._removePeer(peerId);
        };

        peer.onLatencyUpdate = (latency) => {
            this.onLatencyUpdate?.(peerId, latency);
        };

        this.peers.set(peerId, peer);
        await peer.createOffer();
    }

    _removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.close();
            this.peers.delete(peerId);
        }
        
        this.removePlayer(peerId);
    }

    // Public method to remove a player from the game state
    removePlayer(playerId) {
        if (this.gameState && this.gameState.players[playerId]) {
            removePlayer(this.gameState, playerId);
            console.log(`[Host] Removed player ${playerId} from game`);
        }
    }

    _handlePeerMessage(peerId, data) {
        switch (data.type) {
            case 'player-move':
                if (this.gameState && !this.gameState.isGameOver) {
                    handleDirectionChange(this.gameState, peerId, data.direction);
                }
                break;
            case 'player-ready':
                // Handle ready state if needed
                break;
        }
    }

    initializeGame() {
        const { duration, mode, teamNames } = this.roomConfig;
        this.gameState = createInitialState(duration, mode, teamNames);

        // Add all lobby players to game state
        for (const player of this.lobbyPlayers) {
            const forcedTeam = mode !== 'practica' ? player.team : null;
            addPlayer(this.gameState, player.id, player.username, forcedTeam, player.color);
        }

        // Set up starting positions
        resetBall(this.gameState);
        this.gameState.isPausedForGoal = true;

        return this.gameState;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // Send initial state immediately so canvas renders during countdown
        const initialState = serializeGameState(this.gameState);
        this.onGameUpdate?.(initialState);
        this.peers.forEach(peer => {
            peer.send({ type: 'game-update', state: initialState });
        });

        const callbacks = {
            onUpdate: (state, soundEvents = []) => {
                const serialized = serializeGameState(state);
                
                // Update local UI
                this.onGameUpdate?.(serialized);
                if (soundEvents.length > 0) {
                    this.onSoundEvents?.(soundEvents);
                }

                // Broadcast to all peers
                this.peers.forEach(peer => {
                    peer.send({ type: 'game-update', state: serialized });
                    if (soundEvents.length > 0) {
                        peer.send({ type: 'sound-events', events: soundEvents });
                    }
                });
            },

            onEnd: (finalState) => {
                this.isRunning = false;
                const gameOverData = {
                    score: finalState.score,
                    winner: finalState.winner,
                    teamNames: finalState.teamNames,
                    playerMatchStats: finalState.playerMatchStats,
                };

                this.onGameOver?.(gameOverData);

                // Broadcast game over to peers
                this.peers.forEach(peer => {
                    peer.send({ type: 'game-over', data: gameOverData });
                });

                // Notify server to save stats
                this.socket.emit('p2p-game-over', {
                    roomId: this.roomId,
                    finalState: gameOverData
                });

                this._clearIntervals();
            },

            onGoalScored: (onCountdownPause) => {
                this._runKickoffCountdown(onCountdownPause);
            },

            onCountdown: ({ isDramatic }) => {
                const event = { type: 'countdown', isDramatic };
                this.onSoundEvents?.([event]);
                this.peers.forEach(peer => {
                    peer.send({ type: 'sound-events', events: [event] });
                });
            },

            onCountdownPause: ({ action }) => {
                const event = { type: 'countdownControl', action };
                this.onSoundEvents?.([event]);
                this.peers.forEach(peer => {
                    peer.send({ type: 'sound-events', events: [event] });
                });
            }
        };

        // Pre-game countdown
        this._runPreGameCountdown(() => {
            this.intervals = startGame(this.gameState, callbacks);
        });
    }

    _runPreGameCountdown(onComplete) {
        let count = 3;
        const tick = () => {
            // Emit countdown to local UI
            this.onKickoffCountdown?.(count);
            
            // Broadcast to peers
            this.peers.forEach(peer => {
                peer.send({ type: 'kickoff-countdown', count });
            });

            if (count > 0) {
                this.onSoundEvents?.([{ type: 'beep' }]);
                this.peers.forEach(peer => {
                    peer.send({ type: 'sound-events', events: [{ type: 'beep' }] });
                });
            }

            if (count === 0) {
                this.onSoundEvents?.([{ type: 'whistle' }]);
                this.peers.forEach(peer => {
                    peer.send({ type: 'sound-events', events: [{ type: 'whistle' }] });
                });
                onComplete();
                return;
            }

            count--;
            setTimeout(tick, 1000);
        };
        tick();
    }

    _runKickoffCountdown(onCountdownPause) {
        let count = 3;
        const tick = () => {
            this.onKickoffCountdown?.(count);
            this.peers.forEach(peer => {
                peer.send({ type: 'kickoff-countdown', count });
            });

            if (count > 0) {
                this.onSoundEvents?.([{ type: 'beep' }]);
                this.peers.forEach(peer => {
                    peer.send({ type: 'sound-events', events: [{ type: 'beep' }] });
                });
            }

            if (count === 0) {
                this.onSoundEvents?.([{ type: 'whistle' }]);
                this.peers.forEach(peer => {
                    peer.send({ type: 'sound-events', events: [{ type: 'whistle' }] });
                });
                resumeAfterKickoff(this.gameState);
                if (this.gameState.countdownActive && onCountdownPause) {
                    onCountdownPause({ action: 'resume' });
                }
                return;
            }

            count--;
            setTimeout(tick, 1000);
        };
        tick();
    }

    // Handle local player input (host's own input)
    handleLocalInput(direction) {
        console.log(`[Host] handleLocalInput: direction=${direction}, myPlayerId=${this.myPlayerId}, gameState exists=${!!this.gameState}, isGameOver=${this.gameState?.isGameOver}`);
        if (this.gameState && !this.gameState.isGameOver) {
            handleDirectionChange(this.gameState, this.myPlayerId, direction);
            console.log(`[Host] Direction changed for player ${this.myPlayerId}`);
        }
    }

    _clearIntervals() {
        if (this.intervals) {
            clearInterval(this.intervals.game);
            clearInterval(this.intervals.timer);
            this.intervals = null;
        }
    }

    getLatencies() {
        const latencies = {};
        this.peers.forEach((peer, peerId) => {
            latencies[peerId] = peer.getLatency();
        });
        return latencies;
    }

    destroy() {
        this._clearIntervals();
        this.peers.forEach(peer => peer.close());
        this.peers.clear();
        this.isRunning = false;
        
        // Remove socket listeners to avoid duplicates on reconnect
        this.socket.off('rtc-request-connection');
        this.socket.off('rtc-answer');
        this.socket.off('rtc-ice-candidate');
        this.socket.off('peer-disconnected');
    }
}
