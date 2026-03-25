// P2P Client Game Manager
// Connects to host and receives game state updates

import { PeerConnection } from './PeerConnection.js';

export class ClientGame {
    constructor(socket, roomId, hostId) {
        this.socket = socket;
        this.roomId = roomId;
        this.hostId = hostId;
        this.hostPeer = null;
        this.gameState = null;
        this.isConnected = false;
        this.latency = 0;

        // Callbacks for UI
        this.onGameUpdate = null;
        this.onSoundEvents = null;
        this.onGameOver = null;
        this.onKickoffCountdown = null;
        this.onLatencyUpdate = null;
        this.onConnectionStateChange = null;
        this.onGameStarting = null;

        // Don't connect immediately - wait for callbacks to be set
        this._setupSocketListeners();
    }

    connect() {
        // Request connection to host via server
        this.socket.emit('rtc-request-connection', {
            roomId: this.roomId,
            hostId: this.hostId,
            username: window.currentUser?.username || 'Jugador'
        });
    }

    _setupSocketListeners() {
        // Wait for offer from host
        this.socket.on('rtc-offer', async ({ fromId, offer }) => {
            if (fromId === this.hostId) {
                await this._handleHostOffer(offer);
            }
        });

        this.socket.on('rtc-ice-candidate', async ({ fromId, candidate }) => {
            if (fromId === this.hostId && this.hostPeer) {
                await this.hostPeer.handleIceCandidate(candidate);
            }
        });
    }

    async _handleHostOffer(offer) {
        this.hostPeer = new PeerConnection(this.socket, this.hostId, false);

        this.hostPeer.onMessage = (data) => this._handleHostMessage(data);

        this.hostPeer.onConnected = () => {
            console.log('[Client] Connected to host via P2P');
            this.isConnected = true;
            this.onConnectionStateChange?.('connected');
        };

        this.hostPeer.onDisconnected = () => {
            console.log('[Client] Disconnected from host');
            this.isConnected = false;
            this.onConnectionStateChange?.('disconnected');
        };

        this.hostPeer.onLatencyUpdate = (latency) => {
            this.latency = latency;
            this.onLatencyUpdate?.(latency);
        };

        await this.hostPeer.handleOffer(offer);
    }

    _handleHostMessage(data) {
        console.log(`[Client] Received message type: ${data.type}`);
        switch (data.type) {
            case 'game-update':
                this.gameState = data.state;
                this.lastReceivedState = data.state; // Save for host takeover
                this.onGameUpdate?.(data.state);
                break;

            case 'game-state-sync':
                // Full state sync when joining mid-game
                this.gameState = data.state;
                this.lastReceivedState = data.state; // Save for host takeover
                this.onGameUpdate?.(data.state);
                break;

            case 'sound-events':
                this.onSoundEvents?.(data.events);
                break;

            case 'kickoff-countdown':
                this.onKickoffCountdown?.(data.count);
                break;

            case 'game-over':
                this.onGameOver?.(data.data);
                break;

            case 'game-starting':
                // Host is starting the game
                this.onGameStarting?.(data);
                break;
        }
    }

    // Send input to host
    sendInput(direction) {
        if (this.hostPeer && this.isConnected) {
            this.hostPeer.send({
                type: 'player-move',
                direction
            });
        }
    }

    sendReady() {
        if (this.hostPeer && this.isConnected) {
            this.hostPeer.send({ type: 'player-ready' });
        }
    }

    getLatency() {
        return this.latency;
    }

    isP2PConnected() {
        return this.isConnected && this.hostPeer?.isConnected;
    }

    destroy() {
        // Remove socket listeners to avoid duplicates on reconnect
        this.socket.off('rtc-offer');
        this.socket.off('rtc-ice-candidate');
        
        if (this.hostPeer) {
            this.hostPeer.close();
            this.hostPeer = null;
        }
        this.isConnected = false;
    }
}
