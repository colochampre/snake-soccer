// Theme System
const ThemeManager = {
    themes: ['retro', 'jinxed'],
    currentThemeIndex: 0,

    init() {
        const savedTheme = localStorage.getItem('selectedTheme');
        if (savedTheme && this.themes.includes(savedTheme)) {
            this.currentThemeIndex = this.themes.indexOf(savedTheme);
            this.applyTheme(savedTheme);
        } else {
            this.applyTheme(this.themes[0]);
        }
    },

    applyTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('selectedTheme', themeName);
    },

    toggleTheme() {
        this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
        const newTheme = this.themes[this.currentThemeIndex];
        this.applyTheme(newTheme);
        return newTheme;
    },

    getCurrentTheme() {
        return this.themes[this.currentThemeIndex];
    }
};

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

    ThemeManager.init();

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

    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const newTheme = ThemeManager.toggleTheme();
            console.log(`Tema cambiado a: ${newTheme}`);
        });
    }

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

        if (keyState.hasOwnProperty(e.key.toLowerCase()) && !keyState[e.key.toLowerCase()]) {
            keyElements[e.key.toLowerCase()]?.classList.add('text-white', 'border-white');
            keyState[e.key.toLowerCase()] = true;
        }
    });

    // Evento cuando se suelta la tecla
    document.addEventListener('keyup', (e) => {
        if (keyState.hasOwnProperty(e.key.toLowerCase())) {
            keyElements[e.key.toLowerCase()]?.classList.remove('text-white', 'border-white');
            keyState[e.key.toLowerCase()] = false;
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