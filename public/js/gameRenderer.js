// === CANVAS & GAME RENDERING ===

const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const SEG = 20;

// --- Ball Texture ---
let ballTexture = new Image();
let ballPattern = null;

const BALL_TEXTURE_MAP = {
    'texture-1': '/img/ball-base-1.png',
    'texture-2': '/img/ball-base-2.png',
    'texture-3': '/img/ball-base-3.png',
};

function updateBallTexture(texturePath) {
    ballTexture = new Image();
    ballTexture.onload = function () {
        ballPattern = ctx ? ctx.createPattern(ballTexture, 'repeat') : null;
    };
    ballTexture.src = texturePath;
}

// --- Drawing Helpers ---
function getTeamColorFromCSS(team) {
    if (team && team.startsWith('#')) return team;
    const styles = getComputedStyle(document.documentElement);
    if (team === 'team1') return styles.getPropertyValue('--team-a').trim();
    if (team === 'team2') return styles.getPropertyValue('--team-b').trim();
    return '#2ECC40';
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

// --- Game Field ---
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
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, fy, fieldWidth, fieldHeight);

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
        const teamName = state.teamNames?.[state.goalScoredBy] || (state.goalScoredBy === 'team1' ? 'Equipo A' : 'Equipo B');
        const text = `¡GOL de ${teamName.toUpperCase()}!`;
        ctx.font = `bold ${Math.max(20, Math.round(W * 0.04))}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(text, W / 2, H / 2);
        ctx.textAlign = 'left';
    }

    if (state.isGameOver && state.winner) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);
        let text;
        if (state.winner === 'draw') {
            text = '¡EMPATE!';
        } else {
            const teamName = state.teamNames?.[state.winner] || (state.winner === 'team1' ? 'Equipo 1' : 'Equipo 2');
            text = `¡${teamName.toUpperCase()} GANA!`;
        }
        ctx.font = `bold ${Math.max(24, Math.round(W * 0.045))}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(text, W / 2, H / 2);
        ctx.textAlign = 'left';
    }
}

// --- Ball ---
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

// --- Snakes on field ---
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
        /*if (isHead) {
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
        }*/
    }
    const head = body[0];
    ctx.font = `${Math.max(9, SEG * 0.6)}px monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(player.username, head.x + SEG / 2, head.y - 3);
    ctx.textAlign = 'left';
}

// --- Scoreboard ---
function updateScoreboard(state) {
    const scoreEl = document.getElementById('score');
    const timerEl = document.getElementById('timer');
    if (scoreEl) scoreEl.textContent = `${state.score.team1} - ${state.score.team2}`;
    if (timerEl) {
        const t = Math.max(0, state.timeLeft);
        timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
}
