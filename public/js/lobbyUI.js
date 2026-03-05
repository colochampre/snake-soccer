const socket = io();

socket.on('rooms-updated', (rooms) => {
    updateRoomList(rooms);
});

// Ball selector functionality
document.addEventListener('DOMContentLoaded', () => {
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
    ball.innerHTML = `<i class="bi bi-circle-fill"></i> ${room.ball}`;
    
    info.appendChild(mode);
    info.appendChild(duration);
    info.appendChild(ball);
    
    card.appendChild(header);
    card.appendChild(info);
    
    return card;
}
