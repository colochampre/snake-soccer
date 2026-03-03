document.addEventListener('DOMContentLoaded', () => {
    const lobbyToggle = document.getElementById('lobbyToggle');
    const userToggle = document.getElementById('userToggle');
    const lobbyPanel = document.getElementById('lobbyPanel');
    const userPanel = document.getElementById('userPanel');
    const overlay = document.getElementById('overlay');
    const keyState = {
        w: false,
        a: false,
        s: false,
        d: false,
        arrowup: false,
        arrowdown: false,
        arrowleft: false,
        arrowright: false
    };

    const keyElements = {
        w: document.getElementById('keyW'),
        a: document.getElementById('keyA'),
        s: document.getElementById('keyS'),
        d: document.getElementById('keyD'),
        arrowup: document.getElementById('keyUp'),
        arrowdown: document.getElementById('keyDown'),
        arrowleft: document.getElementById('keyLeft'),
        arrowright: document.getElementById('keyRight')
    };

    // Toggle Lobby Panel
    if (lobbyToggle && lobbyPanel) {
        lobbyToggle.addEventListener('click', () => {
            const isOpen = lobbyPanel.classList.contains('open');

            // Cerrar panel de usuario si está abierto
            userPanel?.classList.remove('open');

            // Toggle lobby panel
            lobbyPanel.classList.toggle('open');
            overlay.classList.toggle('active', !isOpen);
        });
    }

    // Toggle User Panel
    if (userToggle && userPanel) {
        userToggle.addEventListener('click', () => {
            const isOpen = userPanel.classList.contains('open');

            // Cerrar panel de lobby si está abierto
            lobbyPanel?.classList.remove('open');

            // Toggle user panel
            userPanel.classList.toggle('open');
            overlay.classList.toggle('active', !isOpen);
        });
    }

    // Cerrar paneles al hacer click en overlay
    if (overlay) {
        overlay.addEventListener('click', () => {
            lobbyPanel?.classList.remove('open');
            userPanel?.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Eventos cuando se presiona la tecla
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            lobbyPanel?.classList.remove('open');
            userPanel?.classList.remove('open');
            overlay?.classList.remove('active');
        }

        if (userPanel?.classList.contains('open')) {
            if (keyState.hasOwnProperty(e.key.toLowerCase()) && !keyState[e.key.toLowerCase()]) {
                keyElements[e.key.toLowerCase()]?.classList.add('text-white', 'border-white');
                keyState[e.key.toLowerCase()] = true;
            }
        }
    });

    // Evento cuando se suelta la tecla
    document.addEventListener('keyup', (e) => {
        if (userPanel?.classList.contains('open')) {
            if (keyState.hasOwnProperty(e.key.toLowerCase())) {
                keyElements[e.key.toLowerCase()]?.classList.remove('text-white', 'border-white');
                keyState[e.key.toLowerCase()] = false;
            }
        }
    });

    // Ready button functionality - close lobby panel
    const readyBtn = document.getElementById('ready');
    if (readyBtn && lobbyPanel) {
        readyBtn.addEventListener('click', () => {
            lobbyPanel.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Back button functionality
    document.querySelectorAll('.history-back').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            history.back();
        });
    });
});