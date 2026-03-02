document.addEventListener('DOMContentLoaded', () => {
    const lobbyToggle = document.getElementById('lobbyToggle');
    const userToggle = document.getElementById('userToggle');
    const lobbyPanel = document.getElementById('lobbyPanel');
    const userPanel = document.getElementById('userPanel');
    const overlay = document.getElementById('overlay');

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

    // Cerrar paneles con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            lobbyPanel?.classList.remove('open');
            userPanel?.classList.remove('open');
            overlay?.classList.remove('active');
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