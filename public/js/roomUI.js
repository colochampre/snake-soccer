const socket = io();

const roomId = window.location.pathname.split('/')[2];
const playersContainer = document.getElementById('players-container');
const leaveRoomBtn = document.getElementById('leave-room');

let gameState = null;
let playerData = null;

const username = window.currentUser?.username || 'Jugador';
socket.emit('join-room', { roomId, username });

socket.on('room-joined', (data) => {
    console.log('Joined room:', data);
    playerData = data.player;
    updatePlayersList(data.players);
});

socket.on('player-joined', (data) => {
    console.log('Player joined:', data);
    updatePlayersList(data.players);
});

socket.on('player-left', (data) => {
    console.log('Player left:', data);
    updatePlayersList(data.players);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    alert(error.message);
    if (error.redirect) {
        window.location.href = '/';
    }
});

function updatePlayersList(players) {
    if (!playersContainer) return;

    if (players.length === 0) {
        playersContainer.innerHTML = '<p class="text-center">Esperando jugadores...</p>';
        return;
    }

    playersContainer.innerHTML = players.map(player => `
        <div class="player-item">
            <i class="bi bi-person-fill"></i>
            <span>${player.username}</span>
        </div>
    `).join('');
}

if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', () => {
        socket.emit('leave-room', roomId);
        window.location.href = '/';
    });
}
