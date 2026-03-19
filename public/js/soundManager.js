// === SOUND MANAGER ===
// Centralized sound management system with randomization support

const SoundManager = {
    // Sound library organized by category and type
    sounds: {
        ballKick: {
            normal: [
                '/sound/ball-kick-1.mp3',
                '/sound/ball-kick-2.mp3',
                '/sound/ball-kick-3.mp3',
                '/sound/ball-kick-4.mp3',
            ],
            boost: [
                '/sound/ball-boost-kick-1.mp3',
                '/sound/ball-boost-kick-2.mp3',
                '/sound/ball-boost-kick-3.mp3',
            ]
        },
        hitPost: {
            touch: [
                '/sound/ball-post-touch-1.mp3',
            ],
            hit: [
                '/sound/ball-post-hit-1.mp3',
                '/sound/ball-post-hit-2.mp3',
                '/sound/ball-post-hit-3.mp3',
            ]
        },
        net: {
            hit: [
                '/sound/goal-net-hit-1.mp3',
                '/sound/goal-net-hit-2.mp3',
                '/sound/goal-net-hit-3.mp3',
            ]
        },
        // Future sound categories can be added here:
        // goal: { ... },
        // countdown: { ... },
    },

    // Audio pool for concurrent playback
    audioPool: {},
    poolSize: 3,

    // Volume settings
    masterVolume: 0.7,
    categoryVolumes: {
        ballKick: 1.0
    },

    // Enabled state
    enabled: true,

    init() {
        // Preload all sounds into audio pools
        for (const category in this.sounds) {
            this.audioPool[category] = {};
            for (const type in this.sounds[category]) {
                this.audioPool[category][type] = [];
                for (const src of this.sounds[category][type]) {
                    const pool = [];
                    for (let i = 0; i < this.poolSize; i++) {
                        const audio = new Audio(src);
                        audio.preload = 'auto';
                        pool.push(audio);
                    }
                    this.audioPool[category][type].push(pool);
                }
            }
        }

        // Load saved preferences
        const savedEnabled = localStorage.getItem('soundEnabled');
        if (savedEnabled !== null) {
            this.enabled = savedEnabled === 'true';
        }
        const savedVolume = localStorage.getItem('soundVolume');
        if (savedVolume !== null) {
            this.masterVolume = parseFloat(savedVolume);
        }
    },

    play(category, type = 'normal') {
        if (!this.enabled) return;

        const categoryPool = this.audioPool[category];
        if (!categoryPool || !categoryPool[type]) {
            console.warn(`Sound not found: ${category}.${type}`);
            return;
        }

        // Pick a random sound variant
        const variants = categoryPool[type];
        const variantIndex = Math.floor(Math.random() * variants.length);
        const pool = variants[variantIndex];

        // Find an available audio element from the pool
        let audio = pool.find(a => a.paused || a.ended);
        if (!audio) {
            // All are playing, use the first one (will restart)
            audio = pool[0];
        }

        // Calculate final volume
        const categoryVolume = this.categoryVolumes[category] || 1.0;
        audio.volume = this.masterVolume * categoryVolume;
        audio.currentTime = 0;
        audio.play().catch(() => {
            // Autoplay blocked, ignore silently
        });
    },

    playBallKick(isBoost = false) {
        this.play('ballKick', isBoost ? 'boost' : 'normal');
    },

    playHitPost(isHardHit = false) {
        this.play('hitPost', isHardHit ? 'hit' : 'touch');
    },

    playNetHit() {
        this.play('net', 'hit');
    },

    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem('soundEnabled', enabled.toString());
    },

    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        localStorage.setItem('soundVolume', this.masterVolume.toString());
    },

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    SoundManager.init();
});

// Export for use in other modules
window.SoundManager = SoundManager;
