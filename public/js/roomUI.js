const socket = io();

const roomId = window.location.pathname.split('/')[2];

// P2P State
let p2pManager = null;
let useP2P = false;
let pingEl = null;
const playersContainer = document.getElementById('playersContainer');
const leaveRoomBtn = document.getElementById('leaveRoom');
const readyBtn = document.getElementById('ready');
const switchTeamBtn = document.getElementById('switchTeam');

let myPlayer = null;
let roomMode = null;
let allPlayers = [];
let teamNames = { team1: 'Equipo A', team2: 'Equipo B' };

const username = window.currentUser?.username || 'Jugador';
socket.emit('join-room', { roomId, username });

socket.on('room-joined', async (data) => {
    myPlayer = data.player;
    roomMode = data.room.mode;
    allPlayers = data.players;
    useP2P = data.room.useP2P || false;
    if (data.room.teamNames) teamNames = data.room.teamNames;
    const texturePath = BALL_TEXTURE_MAP[data.room.ball] || '/img/ball-base-1.png';
    updateBallTexture(texturePath);
    setupLobbyUI();
    renderLobby(data.players, data.canStart);

    // Initialize P2P if enabled
    if (useP2P) {
        try {
            const { P2PManager } = await import('./webrtc/P2PManager.js');
            p2pManager = new P2PManager(socket, roomId, {
                duration: data.room.duration,
                mode: data.room.mode,
                teamNames: data.room.teamNames
            });
            p2pManager.initialize(data.players, socket.id);
            setupP2PCallbacks();
            console.log('[P2P] Manager initialized');
        } catch (e) {
            console.error('[P2P] Failed to initialize:', e);
            useP2P = false;
        }
    }
});

socket.on('lobby-updated', (data) => {
    allPlayers = data.players;
    const me = data.players.find(p => p.id === myPlayer?.id);
    if (me) myPlayer = me;
    if (data.teamNames) teamNames = data.teamNames;
    renderLobby(data.players, data.canStart);

    // Update P2P manager with new player list
    if (p2pManager) {
        p2pManager.updatePlayers(data.players);
    }
});

// P2P game start - triggered when all players are ready in P2P mode
socket.on('p2p-start-game', (data) => {
    console.log('[P2P] Received p2p-start-game event', data);
    if (!p2pManager) {
        console.error('[P2P] No P2P manager available');
        return;
    }

    // Clean up any existing game before starting new one
    if (p2pManager.game) {
        p2pManager.destroy();
    }

    // Update players and config
    p2pManager.lobbyPlayers = data.players;
    p2pManager.roomConfig = data.roomConfig;
    
    // Start the P2P game
    p2pManager.startGame();
});

// P2P join active game - when a player joins a room with an active P2P game
socket.on('p2p-join-active-game', async (data) => {
    console.log('[P2P] Joining active game', data);
    if (!p2pManager) {
        console.error('[P2P] No P2P manager available');
        return;
    }

    // Update players and config
    p2pManager.lobbyPlayers = data.players;
    p2pManager.roomConfig = data.roomConfig;
    p2pManager.hostId = data.hostId;
    
    // Start as client to connect to the existing host
    p2pManager._startAsClient();
});

// P2P player left - just remove their snake, game continues
socket.on('p2p-player-left', ({ playerId }) => {
    console.log(`[P2P] Player ${playerId} left`);
    if (p2pManager && p2pManager.isHost && p2pManager.game) {
        // Host removes the player from game state
        p2pManager.game.removePlayer(playerId);
    }
});

// P2P host changed - a client becomes the new host
socket.on('p2p-host-changed', ({ newHostId, disconnectedPlayerId, players }) => {
    console.log(`[P2P] Host changed to ${newHostId}, I am ${socket.id}`);
    
    if (!p2pManager) return;
    
    // Update players list
    p2pManager.updatePlayers(players);
    
    if (newHostId === socket.id) {
        // I am the new host - need to take over game logic
        console.log('[P2P] I am now the host!');
        p2pManager.becomeHost(disconnectedPlayerId);
    } else {
        // I'm still a client, just update my host reference
        p2pManager.hostId = newHostId;
        if (p2pManager.game) {
            p2pManager.game.hostId = newHostId;
        }
    }
});

const countdownEl = document.getElementById('countdownOverlay');
let isGameActive = false;
let countdownHideTimer = null;

socket.on('game-starting', (data) => {
    isGameActive = true;
    if (canvas && data) {
        canvas.width = data.canvasWidth;
        canvas.height = data.canvasHeight;
    }
    const lobbyPanel = document.getElementById('lobbyPanel');
    if (lobbyPanel) lobbyPanel.classList.remove('open');
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('active');
    initJoystick();
    updateReadyButton();
    // Start interpolated render loop
    if (window.gameRenderer) window.gameRenderer.startRenderLoop();
});

const timerEl = document.getElementById('timer');

socket.on('game-update', (state) => {
    if (!ctx) return;
    if (canvas.width !== state.canvasWidth) canvas.width = state.canvasWidth;
    if (canvas.height !== state.canvasHeight) canvas.height = state.canvasHeight;

    // Use interpolation system instead of direct render
    if (window.gameRenderer) {
        window.gameRenderer.updateGameState(state);
        window.gameRenderer.updateScoreboard(state);
    } else {
        renderGame(state);
        updateScoreboard(state);
    }

    if (timerEl) {
        if (state.timeLeft <= 10 && !state.isGameOver) {
            timerEl.classList.add('timer-danger');
        } else {
            timerEl.classList.remove('timer-danger');
        }
    }
});

socket.on('kickoff-countdown', ({ count }) => {
    if (!countdownEl) return;
    countdownEl.textContent = count > 0 ? count : 'GO!';
    countdownEl.style.display = 'block';
    clearTimeout(countdownHideTimer);
    if (count === 0) {
        countdownHideTimer = setTimeout(() => { countdownEl.style.display = 'none'; }, 700);
    }
});

socket.on('sound-events', (events) => {
    if (!window.SoundManager) return;
    for (const event of events) {
        switch (event.type) {
            case 'ballKick':
                window.SoundManager.playBallKick(event.isBoost); break;
            case 'hitPost':
                window.SoundManager.playHitPost(event.isHardHit); break;
            case 'netHit':
                window.SoundManager.playNetHit(); break;
            case 'countdown':
                window.SoundManager.playCountdown(event.isDramatic); break;
            case 'whistle':
                window.SoundManager.playWhistle(); break;
            case 'beep':
                window.SoundManager.playBeep(); break;
            case 'crowd':
                window.SoundManager.playCrowd(); break;
            case 'countdownControl':
                if (event.action === 'pause') {
                    window.SoundManager.pauseCountdown();
                } else if (event.action === 'resume') {
                    window.SoundManager.resumeCountdown();
                }
                break;
        }
    }
});

socket.on('game-over', (data) => {
    isGameActive = false;
    destroyJoystick();
    // Stop interpolated render loop
    if (window.gameRenderer) window.gameRenderer.stopRenderLoop();
    if (timerEl) timerEl.classList.remove('timer-danger');

    const overlay = document.getElementById('gameOverlay');
    const titleEl = document.getElementById('gameOverTitle');
    const scoreEl = document.getElementById('gameOverScore');
    const statsEl = document.getElementById('gameOverStats');
    if (!overlay) return;

    const tNames = data.teamNames || teamNames;
    if (titleEl) {
        if (data.winner === 'draw') {
            titleEl.textContent = '¡EMPATE!';
        } else {
            const name = tNames[data.winner] || (data.winner === 'team1' ? 'Equipo A' : 'Equipo B');
            titleEl.textContent = `¡GANA ${name.toUpperCase()}!`;
        }
    }
    if (scoreEl) {
        const t1 = tNames.team1 || 'Equipo A';
        const t2 = tNames.team2 || 'Equipo B';
        scoreEl.textContent = `${t1}  ${data.score.team1} — ${data.score.team2}  ${t2}`;
    }

    if (statsEl && data.playerMatchStats) {
        const stats = Object.values(data.playerMatchStats)
            .sort((a, b) => (b.goals - a.goals) || (b.assists - a.assists));
        statsEl.innerHTML = `
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Jugador</th>
                        <th title="Goles"><span class="stat-icon stat-icon-goal"> Goles</span></th>
                        <th title="Asistencias"><span class="stat-icon stat-icon-assist"> Asistencias</span></th>
                        <th title="Toques"><span class="stat-icon stat-icon-crosshair"> Toques</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.map(s => `
                        <tr>
                            <td>${s.username}</td>
                            <td class="stat-value">${s.goals}</td>
                            <td class="stat-value">${s.assists}</td>
                            <td class="stat-value">${s.touches}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    overlay.style.display = 'flex';
});

socket.on('lobby-restored', (data) => {
    isGameActive = false;
    destroyJoystick();
    // Stop interpolated render loop
    if (window.gameRenderer) window.gameRenderer.stopRenderLoop();
    // Clean up P2P game
    if (p2pManager && p2pManager.game) {
        p2pManager.destroy();
    }
    allPlayers = data.players;
    const me = data.players.find(p => p.id === myPlayer?.id);
    if (me) myPlayer = me;
    if (data.teamNames) teamNames = data.teamNames;

    const overlay = document.getElementById('gameOverlay');
    if (overlay) overlay.style.display = 'none';
    if (timerEl) { timerEl.textContent = '0:00'; timerEl.classList.remove('timer-danger'); }
    const scoreDisplay = document.getElementById('score');
    if (scoreDisplay) scoreDisplay.textContent = '0 - 0';

    const lobbyPanel = document.getElementById('lobbyPanel');
    if (lobbyPanel) lobbyPanel.classList.add('open');
    renderLobby(data.players, data.canStart);
});

const gameOverLeaveBtn = document.getElementById('gameOverLeave');
const gameOverRestartBtn = document.getElementById('gameOverRestart');
if (gameOverLeaveBtn) {
    gameOverLeaveBtn.addEventListener('click', () => {
        socket.emit('leave-room', roomId);
        window.location.href = '/';
    });
}
if (gameOverRestartBtn) {
    gameOverRestartBtn.addEventListener('click', () => {
        socket.emit('restart-game', { roomId });
    });
}

socket.on('error', (error) => {
    console.error('Socket error:', error);
    if (error.redirect) window.location.href = '/';
});

function setupLobbyUI() {
    if (!switchTeamBtn) return;
    switchTeamBtn.style.display = roomMode === 'practica' ? 'none' : '';
}

function renderLobby(players, canStart) {
    if (!playersContainer) return;
    if (roomMode === 'practica') {
        renderPracticeLobby(players);
    } else {
        renderTeamLobby(players);
    }
    updateReadyButton();
    updateSwitchTeamButton();
    updateStartStatus(canStart);
}

function getMinPerTeam(mode) {
    if (mode === '2vs2') return 2;
    if (mode === '3vs3') return 3;
    return 1;
}

function teamNameHTML(team, players) {
    const leader = players.filter(p => p.team === team)[0];
    const isLeader = leader?.id === myPlayer?.id;
    const name = teamNames[team];
    if (isLeader) {
        return `<input class="team-name-input" data-team="${team}" value="${name}" maxlength="20">`;
    }
    return `<span>${name}</span>`;
}

function renderTeamLobby(players) {
    const team1 = players.filter(p => p.team === 'team1');
    const team2 = players.filter(p => p.team === 'team2');
    const min = getMinPerTeam(roomMode);

    playersContainer.innerHTML = `
        <div class="teams-container">
            <div class="team-col">
                <div class="team-header t1-header">
                    ${teamNameHTML('team1', players)}
                    <span class="team-count ${team1.length >= min ? 'count-ok' : ''}">${team1.length}/${min}</span>
                </div>
                <div class="team-slots">
                    ${team1.length === 0 ? '<p class="slot-empty">Vacío</p>' : team1.map(p => playerCardHTML(p)).join('')}
                </div>
            </div>
            <div class="teams-vs">VS</div>
            <div class="team-col">
                <div class="team-header t2-header">
                    ${teamNameHTML('team2', players)}
                    <span class="team-count ${team2.length >= min ? 'count-ok' : ''}">${team2.length}/${min}</span>
                </div>
                <div class="team-slots">
                    ${team2.length === 0 ? '<p class="slot-empty">Vacío</p>' : team2.map(p => playerCardHTML(p)).join('')}
                </div>
            </div>
        </div>
    `;

    playersContainer.querySelectorAll('.team-name-input').forEach(input => {
        input.addEventListener('blur', () => {
            const name = input.value.trim();
            if (name) socket.emit('set-team-name', { roomId, team: input.dataset.team, name });
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
    });

    players.forEach(p => drawSnake(p));
}

function renderPracticeLobby(players) {
    playersContainer.innerHTML = `
        <div class="practice-slots">
            ${players.length === 0
            ? '<p class="slot-empty text-center">Esperando jugadores...</p>'
            : players.map(p => playerCardHTML(p)).join('')}
        </div>
    `;
    players.forEach(p => drawSnake(p));
}

function playerCardHTML(player) {
    const isMe = player.id === myPlayer?.id;
    const isSpectator = player.role === 'spectator';
    const effectiveReady = player.isReady || isGameActive;
    const snakeOrBadge = isSpectator
        ? '<span class="spectator-badge">Espectador</span>'
        : `<canvas class="snake-preview" data-color="${player.color}" width="72" height="20"></canvas>`;
    const statusIcon = isSpectator
        ? ''
        : `<i class="bi ${effectiveReady ? 'bi-check-circle-fill ready-icon' : 'bi-hourglass ready-icon not-ready-icon'}"></i>`;
    return `
        <div class="player-card ${isMe ? 'my-card' : ''} ${effectiveReady && !isSpectator ? 'card-ready' : ''} ${isSpectator ? 'card-spectator' : ''}" data-pid="${player.id}">
            ${snakeOrBadge}
            <span class="player-name">${player.username}</span>
            ${statusIcon}
        </div>
    `;
}

function drawSnake(player) {
    if (player.role === 'spectator') return;
    const card = playersContainer.querySelector(`[data-pid="${player.id}"]`);
    if (!card) return;
    const canvas = card.querySelector('.snake-preview');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const color = getTeamColorFromCSS(player.color) || '#2ECC40';
    const segSize = 18;
    const gap = 2;
    const segments = 3;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < segments; i++) {
        const x = (segments - 1 - i) * (segSize + gap);
        const y = 1;
        const isHead = i === 0;

        ctx.fillStyle = isHead ? lighten(color, 40) : color;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        rrect(ctx, x, y, segSize, segSize, 3);
        ctx.fill();
        ctx.stroke();

        if (isHead) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x + segSize - 5, y + 5, 2, 0, Math.PI * 2);
            ctx.arc(x + segSize - 5, y + segSize - 5, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(x + segSize - 4, y + 5, 1, 0, Math.PI * 2);
            ctx.arc(x + segSize - 4, y + segSize - 5, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function updateReadyButton() {
    if (!readyBtn || !myPlayer) return;
    const me = allPlayers.find(p => p.id === myPlayer.id);
    if (!me) return;
    if (me.role === 'spectator') {
        readyBtn.style.display = 'none';
        return;
    }
    readyBtn.style.display = '';
    readyBtn.disabled = isGameActive;
    const icon = readyBtn.querySelector('i');
    const label = readyBtn.querySelector('span');

    if (me.isReady) {
        readyBtn.classList.add('btn-unready');
        if (icon) icon.className = 'bi bi-hourglass-split';
        if (label) label.textContent = 'No listo';
    } else {
        readyBtn.classList.remove('btn-unready');
        if (icon) icon.className = 'bi bi-check2-square';
        if (label) label.textContent = 'Listo';
    }
}

function updateSwitchTeamButton() {
    if (!switchTeamBtn || roomMode === 'practica') return;
    const me = allPlayers.find(p => p.id === myPlayer?.id);
    if (!me) return;
    switchTeamBtn.disabled = me.isReady;
    const label = switchTeamBtn.querySelector('span');
    if (label) label.textContent = me.team === 'team1' ? 'Cambiar a equipo B' : 'Cambiar a equipo A';
}

function updateStartStatus(canStart) {
    if (!readyBtn) return;
    readyBtn.classList.toggle('all-ready', !!canStart);
}

if (readyBtn) {
    readyBtn.addEventListener('click', () => {
        socket.emit('player-ready', { roomId });
    });
}

if (switchTeamBtn) {
    switchTeamBtn.addEventListener('click', () => {
        socket.emit('switch-team', { roomId });
    });
}

if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', () => {
        socket.emit('leave-room', roomId);
        window.location.href = '/';
    });
}

// === NIPPLEJS JOYSTICK (touch) ===
const joystickZone = document.getElementById('joystickZone');
let joystickManager = null;

function initJoystick() {
    if (typeof nipplejs === 'undefined' || !joystickZone) return;
    if (joystickManager) return;
    if (window.innerWidth >= 1536) return;

    joystickZone.classList.add('active');

    joystickManager = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        color: 'rgba(255,255,255,0.55)',
        size: 110,
        multitouch: false,
        restOpacity: 0.5,
        fadeTime: 250,
    });

    const DIRS = ['up', 'down', 'left', 'right'];
    DIRS.forEach(dir => {
        joystickManager.on(`dir:${dir}`, () => {
            if (!isGameActive) return;
            if (useP2P && p2pManager) {
                p2pManager.handleInput(dir);
            } else {
                socket.emit('player-move', { roomId, direction: dir });
            }
        });
    });
}

function destroyJoystick() {
    if (joystickManager) {
        joystickManager.destroy();
        joystickManager = null;
    }
    if (joystickZone) joystickZone.classList.remove('active');
}

// === KEYBOARD INPUT ===
const DIR_MAP = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
};

document.addEventListener('keydown', (e) => {
    if (!isGameActive) return;
    const dir = DIR_MAP[e.key.toLowerCase()];
    if (dir) {
        e.preventDefault();
        if (useP2P && p2pManager) {
            p2pManager.handleInput(dir);
        } else {
            socket.emit('player-move', { roomId, direction: dir });
        }
    }
});

const mobileDirBtns = { keyUp: 'up', keyDown: 'down', keyLeft: 'left', keyRight: 'right' };
for (const [id, dir] of Object.entries(mobileDirBtns)) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
        if (!isGameActive) return;
        if (useP2P && p2pManager) {
            p2pManager.handleInput(dir);
        } else {
            socket.emit('player-move', { roomId, direction: dir });
        }
    });
}

// Fullscreen toggle button
const fullscreenToggleBtn = document.getElementById('fullscreenToggle');

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        // Entrar a fullscreen
        const elem = document.documentElement;
        
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => {
                console.log('Fullscreen no disponible:', err);
            });
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    } else {
        // Salir de fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

function updateFullscreenIcon() {
    if (fullscreenToggleBtn) {
        const icon = fullscreenToggleBtn.querySelector('i');
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            icon.className = 'bi bi-fullscreen-exit';
        } else {
            icon.className = 'bi bi-fullscreen';
        }
    }
}

if (fullscreenToggleBtn) {
    fullscreenToggleBtn.addEventListener('click', toggleFullscreen);
}

// Actualizar icono cuando cambia el estado de fullscreen
document.addEventListener('fullscreenchange', updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
document.addEventListener('msfullscreenchange', updateFullscreenIcon);

// === P2P CALLBACKS SETUP ===
function setupP2PCallbacks() {
    if (!p2pManager) return;

    pingEl = document.getElementById('ping');

    p2pManager.onGameUpdate = (state) => {
        console.log('[P2P UI] onGameUpdate called, ctx exists:', !!ctx, 'canvas:', !!canvas);
        if (!ctx) {
            console.log('[P2P UI] No ctx, skipping render');
            return;
        }
        if (canvas.width !== state.canvasWidth) canvas.width = state.canvasWidth;
        if (canvas.height !== state.canvasHeight) canvas.height = state.canvasHeight;

        if (window.gameRenderer) {
            window.gameRenderer.updateGameState(state);
            window.gameRenderer.updateScoreboard(state);
        } else {
            renderGame(state);
            updateScoreboard(state);
        }

        if (timerEl) {
            if (state.timeLeft <= 10 && !state.isGameOver) {
                timerEl.classList.add('timer-danger');
            } else {
                timerEl.classList.remove('timer-danger');
            }
        }
    };

    p2pManager.onSoundEvents = (events) => {
        if (!window.SoundManager) return;
        for (const event of events) {
            switch (event.type) {
                case 'ballKick':
                    window.SoundManager.playBallKick(event.isBoost); break;
                case 'hitPost':
                    window.SoundManager.playHitPost(event.isHardHit); break;
                case 'netHit':
                    window.SoundManager.playNetHit(); break;
                case 'countdown':
                    window.SoundManager.playCountdown(event.isDramatic); break;
                case 'whistle':
                    window.SoundManager.playWhistle(); break;
                case 'beep':
                    window.SoundManager.playBeep(); break;
                case 'crowd':
                    window.SoundManager.playCrowd(); break;
                case 'countdownControl':
                    if (event.action === 'pause') {
                        window.SoundManager.pauseCountdown();
                    } else if (event.action === 'resume') {
                        window.SoundManager.resumeCountdown();
                    }
                    break;
            }
        }
    };

    p2pManager.onKickoffCountdown = (count) => {
        if (!countdownEl) return;
        countdownEl.textContent = count > 0 ? count : 'GO!';
        countdownEl.style.display = 'block';
        clearTimeout(countdownHideTimer);
        if (count === 0) {
            countdownHideTimer = setTimeout(() => { countdownEl.style.display = 'none'; }, 700);
        }
    };

    p2pManager.onGameOver = (data) => {
        isGameActive = false;
        destroyJoystick();
        if (window.gameRenderer) window.gameRenderer.stopRenderLoop();
        if (timerEl) timerEl.classList.remove('timer-danger');

        const overlay = document.getElementById('gameOverlay');
        const titleEl = document.getElementById('gameOverTitle');
        const scoreEl = document.getElementById('gameOverScore');
        const statsEl = document.getElementById('gameOverStats');
        if (!overlay) return;

        const tNames = data.teamNames || teamNames;
        if (titleEl) {
            if (data.winner === 'draw') {
                titleEl.textContent = '¡EMPATE!';
            } else {
                const name = tNames[data.winner] || (data.winner === 'team1' ? 'Equipo A' : 'Equipo B');
                titleEl.textContent = `¡GANA ${name.toUpperCase()}!`;
            }
        }
        if (scoreEl) {
            const t1 = tNames.team1 || 'Equipo A';
            const t2 = tNames.team2 || 'Equipo B';
            scoreEl.textContent = `${t1}  ${data.score.team1} — ${data.score.team2}  ${t2}`;
        }

        if (statsEl && data.playerMatchStats) {
            const stats = Object.values(data.playerMatchStats)
                .sort((a, b) => (b.goals - a.goals) || (b.assists - a.assists));
            statsEl.innerHTML = `
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Jugador</th>
                            <th title="Goles"><span class="stat-icon stat-icon-goal"> Goles</span></th>
                            <th title="Asistencias"><span class="stat-icon stat-icon-assist"> Asistencias</span></th>
                            <th title="Toques"><span class="stat-icon stat-icon-crosshair"> Toques</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.map(s => `
                            <tr>
                                <td>${s.username}</td>
                                <td class="stat-value">${s.goals}</td>
                                <td class="stat-value">${s.assists}</td>
                                <td class="stat-value">${s.touches}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        overlay.style.display = 'flex';
    };

    p2pManager.onGameStarting = (data) => {
        isGameActive = true;
        if (canvas && data) {
            canvas.width = data.canvasWidth;
            canvas.height = data.canvasHeight;
        }
        const lobbyPanel = document.getElementById('lobbyPanel');
        if (lobbyPanel) lobbyPanel.classList.remove('open');
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.classList.remove('active');
        initJoystick();
        updateReadyButton();
        if (window.gameRenderer) window.gameRenderer.startRenderLoop();
    };

    p2pManager.onLatencyUpdate = (latency) => {
        if (pingEl) {
            pingEl.textContent = `${latency}ms`;
            // Color code based on latency
            if (latency < 50) {
                pingEl.style.color = '#2ecc40'; // Green
            } else if (latency < 100) {
                pingEl.style.color = '#ffdc00'; // Yellow
            } else {
                pingEl.style.color = '#ff4136'; // Red
            }
        }
    };
}

