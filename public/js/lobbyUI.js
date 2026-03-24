const socket = io();

socket.on('rooms-updated', (rooms) => {
    updateRoomList(rooms);
});

// Fetch and display user stats
async function loadUserStats() {
    try {
        const response = await fetch('/api/user/stats');
        if (!response.ok) {
            console.error('Failed to load user stats:', response.status);
            return;
        }
        
        const stats = await response.json();
        console.log('User stats loaded:', stats);
        
        // Update stats display
        const statLevel = document.getElementById('statLevel');
        const statGoals = document.getElementById('statGoals');
        const statAssists = document.getElementById('statAssists');
        const statMatches = document.getElementById('statMatches');
        const statWinrate = document.getElementById('statWinrate');
        const statXp = document.getElementById('statXp');
        const xpBarFill = document.getElementById('xpBarFill');
        
        if (statLevel) statLevel.textContent = `Lvl ${stats.level}`;
        if (statGoals) statGoals.innerHTML = `Goles: <span class="stat-value">${stats.goals}</span>`;
        if (statAssists) statAssists.innerHTML = `Asistencias: <span class="stat-value">${stats.assists}</span>`;
        if (statMatches) statMatches.innerHTML = `Partidas: <span class="stat-value">${stats.matches}</span>`;
        if (statWinrate) statWinrate.innerHTML = `Winrate: <span class="stat-value">${stats.winrate}%</span>`;
        if (statXp) statXp.innerHTML = `${stats.currentLevelXp}/${stats.xpToNextLevel} XP`;
        
        // Update XP bar
        if (xpBarFill) {
            const xpPercent = Math.min((stats.currentLevelXp / stats.xpToNextLevel) * 100, 100);
            xpBarFill.style.width = `${xpPercent}%`;
        }
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

// Ball selector functionality
document.addEventListener('DOMContentLoaded', () => {
    // Load user stats on page load
    loadUserStats();
    const ballSelector = document.querySelector('.ball-selector');
    const ballDisplay = document.querySelector('.ball-selector-display');
    const ballDropdown = document.querySelector('.ball-selector-dropdown');
    const ballInput = document.getElementById('selectBall');
    const displayOption = document.querySelector('.ball-selector-display .ball-option');
    
    if (!ballSelector || !ballDisplay || !ballDropdown || !ballInput || !displayOption) return;
    
    // Toggle dropdown
    ballDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        ballSelector.classList.toggle('open');
    });
    
    // Select ball option from dropdown
    const dropdownOptions = ballDropdown.querySelectorAll('.ball-option');
    dropdownOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedBall = option.getAttribute('data-ball');
            
            // Update hidden input
            ballInput.value = selectedBall;
            
            // Update display option
            displayOption.setAttribute('data-ball', selectedBall);
            displayOption.className = 'ball-option ball-selected';
            displayOption.setAttribute('data-ball', selectedBall);
            
            // Close dropdown
            ballSelector.classList.remove('open');
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!ballSelector.contains(e.target)) {
            ballSelector.classList.remove('open');
        }
    });
});

function updateRoomList(rooms) {
    const roomsContainer = document.getElementById('rooms');
    
    if (!rooms || rooms.length === 0) {
        roomsContainer.innerHTML = '<p class="text-center">No hay salas disponibles</p>';
        return;
    }

    roomsContainer.innerHTML = '';
    
    rooms.forEach(room => {
        const roomCard = createRoomCard(room);
        roomsContainer.appendChild(roomCard);
    });
}

function createRoomCard(room) {
    const card = document.createElement('div');
    card.className = 'room-card';
    
    const isFull = room.maxPlayers && room.playerCount >= room.maxPlayers;
    
    if (isFull) {
        card.classList.add('room-full');
    } else {
        card.onclick = () => window.location.href = `/room/${room.id}`;
    }
    
    const header = document.createElement('div');
    header.className = 'room-card-header';
    
    const roomId = document.createElement('span');
    roomId.className = 'room-id';
    roomId.textContent = `#${room.id}`;
    
    const playerCount = document.createElement('span');
    playerCount.className = 'room-players';
    const maxPlayersText = room.maxPlayers ? `/${room.maxPlayers}` : '';
    playerCount.innerHTML = `<i class="bi bi-people-fill"></i> ${room.playerCount}${maxPlayersText}`;
    
    if (isFull) {
        playerCount.innerHTML += ' <span class="room-full-badge">LLENA</span>';
    }
    
    header.appendChild(roomId);
    header.appendChild(playerCount);
    
    const info = document.createElement('div');
    info.className = 'room-card-info';
    
    const mode = document.createElement('span');
    mode.className = 'room-mode';
    mode.innerHTML = `<i class="bi bi-joystick"></i> ${room.mode}`;
    
    const duration = document.createElement('span');
    duration.className = 'room-duration';
    const minutes = Math.floor(room.duration / 60);
    duration.innerHTML = `<i class="bi bi-clock"></i> ${minutes}m`;
    
    const ball = document.createElement('span');
    ball.className = 'room-ball';
    ball.innerHTML = `<span class="ball-option" data-ball="${room.ball}"></span>`;
    
    info.appendChild(mode);
    info.appendChild(duration);
    info.appendChild(ball);
    
    card.appendChild(header);
    card.appendChild(info);
    
    return card;
}
