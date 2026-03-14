// === CANVAS & GAME RENDERING ===

const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const SEG = 20;

// --- Ball Texture ---
let ballTexture = new Image();
let ballPattern = null;

// --- Goal Icons ---
const goalBallIcon = new Image();
goalBallIcon.src = '/img/ball-icon.svg';
const goalAssistIcon = new Image();
goalAssistIcon.src = '/img/high-five-icon.svg';

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

    ctx.fillStyle = '#09260E';
    ctx.fillRect(0, 0, W, H);

    const fx = (W - fieldWidth) / 2;
    const fy = (H - fieldHeight) / 2;

    ctx.fillStyle = '#0B3312';
    ctx.fillRect(fx, fy, fieldWidth, fieldHeight);

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, fy, fieldWidth, fieldHeight);

    ctx.beginPath();
    ctx.moveTo(W / 2, fy);
    ctx.lineTo(W / 2, fy + fieldHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, fieldHeight * 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();

    for (const player of Object.values(state.players)) {
        if (player.body && player.body.length > 0) drawSnakeOnField(player);
    }

    drawBall(state.ball);

    const goalY = (H - goalHeight) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(0, goalY, fx, goalHeight);
    ctx.fillRect(W - fx, goalY, fx, goalHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, goalY, fx, goalHeight);
    ctx.strokeRect(W - fx, goalY, fx, goalHeight);

    if (state.kickOff && !state.isPausedForGoal) {
        ctx.font = `bold ${Math.max(14, Math.round(W * 0.018))}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('TOCA EL BALÓN', W / 2, H / 2 - fieldHeight * 0.16);
        ctx.textAlign = 'left';
    }

    if (state.goalScoredBy) {
        const teamColor = getTeamColorFromCSS(state.goalScoredBy);
        const nameSize = Math.max(16, Math.round(W * 0.026));
        const iconSize = Math.round(nameSize);
        const lineH = Math.round(nameSize * 1.2);
        const hasScorer = !!state.goalScorerUsername;
        const hasAssist = !!state.goalAssisterUsername;
        const rows = (hasScorer ? 1 : 0) + (hasAssist ? 1 : 0) || 1;
        const panelH = Math.round(rows * lineH + 12);
        const panelY = Math.max(8, Math.round(H * 0.03));

        ctx.save();

        let rowY = panelY + 12;

        function drawGoalRow(icon, label, color, bold) {
            ctx.font = `${bold ? 'bold ' : ''}${nameSize}px monospace`;
            const textW = ctx.measureText(label).width;
            const totalW = iconSize + 8 + textW;
            const startX = Math.round((W - totalW) / 2);
            const iconY = rowY + Math.round((lineH - iconSize) / 2);
            if (icon.complete && icon.naturalWidth > 0) {
                const off = document.createElement('canvas');
                off.width = iconSize;
                off.height = iconSize;
                const offCtx = off.getContext('2d');
                offCtx.drawImage(icon, 0, 0, iconSize, iconSize);
                offCtx.globalCompositeOperation = 'source-in';
                offCtx.fillStyle = color;
                offCtx.fillRect(0, 0, iconSize, iconSize);
                ctx.drawImage(off, startX, iconY, iconSize, iconSize);
            }
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, startX + iconSize + 8, rowY + Math.round(lineH / 2));
            rowY += lineH;
        }

        const scorerLabel = `\u00a1GOL de ${state.goalScorerUsername}`;

        if (hasScorer) {
            drawGoalRow(goalBallIcon, scorerLabel, teamColor, true);
        } else {
            drawGoalRow(goalBallIcon, '¡GOL!', teamColor, true);
        }
        
        if (hasAssist) {
            drawGoalRow(goalAssistIcon, state.goalAssisterUsername, '#ddd', false);
        }
        ctx.restore();
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
let ballSpinAngle = 0;

function drawBall(ball) {
    if (!ball || !ball.x) return;

    // Accumulate spin angle and decay towards 0
    ballSpinAngle += (ball.spin || 0);
    ballSpinAngle *= 0.82; // Decay spin effect over time

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ballSpinAngle);
    ctx.translate(-ball.x, -ball.y);

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
