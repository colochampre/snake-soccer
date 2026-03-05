const socket = io();

const roomId = window.location.pathname.split('/')[2];
const playersContainer = document.getElementById('playersContainer');
const leaveRoomBtn = document.getElementById('leaveRoom');
const readyBtn = document.getElementById('ready');
const switchTeamBtn = document.getElementById('switchTeam');

let myPlayer = null;
let roomMode = null;
let allPlayers = [];

const username = window.currentUser?.username || 'Jugador';
socket.emit('join-room', { roomId, username });

socket.on('room-joined', (data) => {
    myPlayer = data.player;
    roomMode = data.room.mode;
    allPlayers = data.players;
    const texturePath = BALL_TEXTURE_MAP[data.room.ball] || '/img/ball-base-1.png';
    updateBallTexture(texturePath);
    setupLobbyUI();
    renderLobby(data.players, data.canStart);
});

socket.on('lobby-updated', (data) => {
    allPlayers = data.players;
    const me = data.players.find(p => p.id === myPlayer?.id);
    if (me) myPlayer = me;
    renderLobby(data.players, data.canStart);
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const countdownEl = document.getElementById('countdownOverlay');
let isGameActive = false;
let countdownHideTimer = null;
const SEG = 20;

let ballTexture = new Image();
let ballPattern = null;

function updateBallTexture(texturePath) {
    ballTexture = new Image();
    ballTexture.onload = function () {
        ballPattern = ctx ? ctx.createPattern(ballTexture, 'repeat') : null;
    };
    ballTexture.src = texturePath;
}

const BALL_TEXTURE_MAP = {
    'texture-1': '/img/ball-base-1.png',
    'texture-2': '/img/ball-base-2.png',
    'texture-3': '/img/ball-base-3.png',
};

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
});

socket.on('game-update', (state) => {
    if (!ctx) return;
    if (canvas.width !== state.canvasWidth) canvas.width = state.canvasWidth;
    if (canvas.height !== state.canvasHeight) canvas.height = state.canvasHeight;
    renderGame(state);
    updateScoreboard(state);
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

socket.on('game-over', (data) => {
    isGameActive = false;
});

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

function renderTeamLobby(players) {
    const team1 = players.filter(p => p.team === 'team1');
    const team2 = players.filter(p => p.team === 'team2');
    const min = getMinPerTeam(roomMode);

    playersContainer.innerHTML = `
        <div class="teams-container">
            <div class="team-col">
                <div class="team-header t1-header">
                    <span>Equipo A</span>
                    <span class="team-count ${team1.length >= min ? 'count-ok' : ''}">${team1.length}/${min}</span>
                </div>
                <div class="team-slots">
                    ${team1.length === 0 ? '<p class="slot-empty">Vacío</p>' : team1.map(p => playerCardHTML(p)).join('')}
                </div>
            </div>
            <div class="teams-vs">VS</div>
            <div class="team-col">
                <div class="team-header t2-header">
                    <span>Equipo B</span>
                    <span class="team-count ${team2.length >= min ? 'count-ok' : ''}">${team2.length}/${min}</span>
                </div>
                <div class="team-slots">
                    ${team2.length === 0 ? '<p class="slot-empty">Vacío</p>' : team2.map(p => playerCardHTML(p)).join('')}
                </div>
            </div>
        </div>
    `;
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
    return `
        <div class="player-card ${isMe ? 'my-card' : ''} ${player.isReady ? 'card-ready' : ''}" data-pid="${player.id}">
            <canvas class="snake-preview" data-color="${player.color}" width="72" height="20"></canvas>
            <span class="player-name">${player.username}</span>
            <i class="bi ${player.isReady ? 'bi-check-circle-fill ready-icon' : 'bi-hourglass ready-icon not-ready-icon'}"></i>
        </div>
    `;
}

function getTeamColorFromCSS(team) {
    const styles = getComputedStyle(document.documentElement);
    if (team === 'team1') return styles.getPropertyValue('--team-a').trim();
    if (team === 'team2') return styles.getPropertyValue('--team-b').trim();
    return '#2ECC40';
}

function drawSnake(player) {
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

function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function lighten(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function updateReadyButton() {
    if (!readyBtn || !myPlayer) return;
    const me = allPlayers.find(p => p.id === myPlayer.id);
    if (!me) return;
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
        socket.emit('player-move', { roomId, direction: dir });
    }
});

const mobileDirBtns = { keyUp: 'up', keyDown: 'down', keyLeft: 'left', keyRight: 'right' };
for (const [id, dir] of Object.entries(mobileDirBtns)) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
        if (isGameActive) socket.emit('player-move', { roomId, direction: dir });
    });
}

// === GAME RENDERING ===
function renderGame(state) {
    if (!ctx || !state.ball) return;
    const { canvasWidth: W, canvasHeight: H, goalHeight, fieldWidth, fieldHeight } = state;

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, W, H);

    const fx = (W - fieldWidth) / 2;
    const fy = (H - fieldHeight) / 2;

    ctx.fillStyle = '#0d2137';
    ctx.fillRect(fx, fy, fieldWidth, fieldHeight);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fieldWidth, fieldHeight);

    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, fy);
    ctx.lineTo(W / 2, fy + fieldHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, fieldHeight * 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    const goalY = (H - goalHeight) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, goalY, fx, goalHeight);
    ctx.fillRect(W - fx, goalY, fx, goalHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, goalY, fx, goalHeight);
    ctx.strokeRect(W - fx, goalY, fx, goalHeight);

    for (const player of Object.values(state.players)) {
        if (player.body && player.body.length > 0) drawSnakeOnField(player);
    }

    drawBall(state.ball);

    if (state.kickOff && !state.isPausedForGoal) {
        ctx.font = `bold ${Math.max(14, Math.round(W * 0.018))}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('TOCA EL BALÓN', W / 2, H / 2 - fieldHeight * 0.12);
        ctx.textAlign = 'left';
    }

    if (state.goalScoredBy) {
        const color = state.goalScoredBy === 'team1' ? 'var(--team-a)' : 'var(--team-b)';
        const text = state.goalScoredBy === 'team1' ? '¡GOL EQUIPO 1!' : '¡GOL EQUIPO 2!';
        ctx.font = `bold ${Math.max(20, Math.round(W * 0.04))}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(text, W / 2, H / 2);
        ctx.textAlign = 'left';
    }

    if (state.isGameOver && state.winner) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);
        const text = state.winner === 'draw' ? '¡EMPATE!' :
            state.winner === 'team1' ? '¡EQUIPO 1 GANA!' : '¡EQUIPO 2 GANA!';
        ctx.font = `bold ${Math.max(24, Math.round(W * 0.045))}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(text, W / 2, H / 2);
        ctx.textAlign = 'left';
    }
}

function drawBall(ball) {
    if (!ball || !ball.x) return;
    ctx.save();
    if (ballPattern && ballTexture.width > 0 && ballTexture.height > 0) {
        const matrix = new DOMMatrix().translate(ball.x * 1.6, ball.y * 1.6);
        ballPattern.setTransform(matrix);
        ctx.fillStyle = ballPattern;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = '#F0F0F0';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
        ctx.fill();
    }
    const gradient = ctx.createRadialGradient(
        ball.x - ball.size * 0.3,
        ball.y - ball.size * 0.3,
        ball.size * 0.1,
        ball.x,
        ball.y,
        ball.size
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawSnakeOnField(player) {
    const { body, headbuttActive } = player;
    const color = getTeamColorFromCSS(player.color) || '#2ECC40';
    for (let i = body.length - 1; i >= 0; i--) {
        const seg = body[i];
        const isHead = i === 0;
        ctx.fillStyle = headbuttActive && isHead ? '#FFD700' : (isHead ? lighten(color, 45) : color);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 1;
        rrect(ctx, seg.x, seg.y, SEG, SEG, 3);
        ctx.fill();
        ctx.stroke();
        if (isHead) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(seg.x + SEG - 5, seg.y + 5, 2.5, 0, Math.PI * 2);
            ctx.arc(seg.x + SEG - 5, seg.y + SEG - 5, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(seg.x + SEG - 4, seg.y + 5, 1.2, 0, Math.PI * 2);
            ctx.arc(seg.x + SEG - 4, seg.y + SEG - 5, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const head = body[0];
    ctx.font = `${Math.max(9, SEG * 0.6)}px monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(player.username, head.x + SEG / 2, head.y - 3);
    ctx.textAlign = 'left';
}

function updateScoreboard(state) {
    const scoreEl = document.getElementById('score');
    const timerEl = document.getElementById('timer');
    if (scoreEl) scoreEl.textContent = `${state.score.team1} - ${state.score.team2}`;
    if (timerEl) {
        const t = Math.max(0, state.timeLeft);
        timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
}
