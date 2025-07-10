// Historical Map Dating Game JavaScript
class HistoricalMapGame {
    constructor() {
        this.currentYear = null;
        this.correctYear = null;
        this.attempts = 0;
        this.maxAttempts = 6;
        this.guessHistory = [];
        this.isGameOver = false;
        this.mode = 'game';
        this.practiceMode = false;

        // Map settings
        this.zoomLevel = 1;
        this.maxZoomLevel = 3;
        this.mapPosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.mapStart = { x: 0, y: 0 };
        this.useOnlineMapZ4 = false;

        // Initialize game
        this.initializeGame();
        this.setupEventListeners();
        this.loadSettings();
    }

    // Generate daily seed based on current date (JST)
    generateDailyYear() {
        const now = new Date();
        const jstOffset = 9 * 60; // JST is UTC+9
        const jstTime = new Date(now.getTime() + jstOffset * 60 * 1000);

        const year = jstTime.getFullYear();
        const month = String(jstTime.getMonth() + 1).padStart(2, '0');
        const day = String(jstTime.getDate()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;

        // Simple hash function for date
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) {
            const char = dateStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return Math.abs(hash) % 2023 + 1;
    }

    // Initialize game
    initializeGame() {
        if (this.mode === 'game') {
            this.correctYear = this.generateDailyYear();
        }
        this.attempts = 0;
        this.guessHistory = [];
        this.isGameOver = false;
        this.updateGameDisplay();
        this.loadMapForYear(this.correctYear);
    }

    // Setup event listeners
    setupEventListeners() {
        // Map interactions
        const mapViewer = document.getElementById('mapViewer');

        // Mouse events
        mapViewer.addEventListener('mousedown', this.handleMouseDown.bind(this));
        mapViewer.addEventListener('mousemove', this.handleMouseMove.bind(this));
        mapViewer.addEventListener('mouseup', this.handleMouseUp.bind(this));
        mapViewer.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Touch events for mobile
        mapViewer.addEventListener('touchstart', this.handleTouchStart.bind(this));
        mapViewer.addEventListener('touchmove', this.handleTouchMove.bind(this));
        mapViewer.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Zoom with mouse wheel
        mapViewer.addEventListener('wheel', this.handleWheel.bind(this));

        // Input events
        const guessInput = document.getElementById('guessInput');
        const practiceGuessInput = document.getElementById('practiceGuessInput');

        if (guessInput) {
            guessInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.makeGuess();
            });
        }

        if (practiceGuessInput) {
            practiceGuessInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.makePracticeGuess();
            });
        }
    }

    // Handle mouse/touch events
    handleMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.mapStart = { x: this.mapPosition.x, y: this.mapPosition.y };
        document.getElementById('mapViewer').classList.add('dragging');
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.dragStart.x;
        const deltaY = e.clientY - this.dragStart.y;

        this.mapPosition.x = this.mapStart.x + deltaX;
        this.mapPosition.y = this.mapStart.y + deltaY;

        this.updateMapTransform();
        this.updateMapInfo();
    }

    handleMouseUp() {
        this.isDragging = false;
        document.getElementById('mapViewer').classList.remove('dragging');
    }

    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} });
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && this.isDragging) {
            const touch = e.touches[0];
            this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.handleMouseUp();
    }

    handleWheel(e) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? -1 : 1;
        const newZoom = Math.max(1, Math.min(this.maxZoomLevel, this.zoomLevel + delta));

        if (newZoom !== this.zoomLevel) {
            this.zoomLevel = newZoom;
            this.updateMapTransform();
            this.updateMapInfo();
            this.loadMapForYear(this.correctYear);
        }
    }

    // Update map transform
    updateMapTransform() {
        const mapCanvas = document.getElementById('mapCanvas');
        const scale = this.zoomLevel;
        const translateX = this.mapPosition.x;
        const translateY = this.mapPosition.y;

        mapCanvas.style.transform = `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`;
    }

    // Update map info display
    updateMapInfo() {
        document.getElementById('zoomLevel').textContent = this.zoomLevel;
        const position = `X: ${Math.round(this.mapPosition.x)}, Y: ${Math.round(this.mapPosition.y)}`;
        document.getElementById('mapPosition').textContent = position;
    }

    // Load map for specific year
    async loadMapForYear(year) {
        if (!year) return;

        const backgroundLayer = document.getElementById('backgroundLayer');
        const countryLayer = document.getElementById('countryLayer');

        // Show loading
        this.showLoading();

        try {
            // Load background and country layers
            await Promise.all([
                this.loadMapLayer(backgroundLayer, year, 'back'),
                this.loadMapLayer(countryLayer, year, String(year).padStart(4, '0'))
            ]);
        } catch (error) {
            console.error('Error loading map:', error);
        } finally {
            this.hideLoading();
        }
    }

    // Load individual map layer
    async loadMapLayer(layer, year, type) {
        const z = this.zoomLevel;
        let imageUrl;

        if (z >= 4 && this.useOnlineMapZ4) {
            // Use online tiles for Z4+
            const tileX = Math.floor(Math.random() * Math.pow(2, z));
            const tileY = Math.floor(Math.random() * Math.pow(2, z));

            if (type === 'back') {
                imageUrl = `https://geacron.b-cdn.net/plain_Z${z}_${tileX}_${tileY}.png`;
            } else {
                imageUrl = `https://geacron.b-cdn.net/tiles/area_${year}_Z${z}_${tileX}_${tileY}.png`;
            }
        } else {
            // Use local tiles for Z1-3
            const tileX = Math.floor(Math.random() * Math.pow(2, z));
            const tileY = Math.floor(Math.random() * Math.pow(2, z));

            if (type === 'back') {
                imageUrl = `./img/back/Z${z}_${tileX}_${tileY}.png`;
            } else {
                imageUrl = await this.findAvailableImage(year, z, tileX, tileY);
            }
        }

        if (imageUrl) {
            layer.style.backgroundImage = `url(${imageUrl})`;
            layer.style.opacity = '1';
        } else {
            layer.style.backgroundImage = '';
            layer.style.opacity = '0';
        }
    }

    // Find available image by going back in years
    async findAvailableImage(startYear, z, tileX, tileY) {
        for (let year = startYear; year >= 1; year--) {
            const yearStr = String(year).padStart(4, '0');
            const imageUrl = `./img/${yearStr}/Z${z}_${tileX}_${tileY}.png`;

            if (await this.imageExists(imageUrl)) {
                return imageUrl;
            }
        }
        return null;
    }

    // Check if image exists
    async imageExists(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    // Show loading overlay
    showLoading() {
        const mapViewer = document.getElementById('mapViewer');
        if (!mapViewer.querySelector('.loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="loading-spinner"></div>地図を読み込み中...';
            mapViewer.appendChild(overlay);
        }
    }

    // Hide loading overlay
    hideLoading() {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // Make a guess
    makeGuess() {
        const guessInput = document.getElementById('guessInput');
        const guess = parseInt(guessInput.value);

        if (!guess || guess < 1 || guess > 2023) {
            alert('1から2023の間で入力してください。');
            return;
        }

        this.processGuess(guess);
        guessInput.value = '';
    }

    // Make a practice guess
    makePracticeGuess() {
        const guessInput = document.getElementById('practiceGuessInput');
        const guess = parseInt(guessInput.value);

        const minYear = parseInt(document.getElementById('practiceMin').value);
        const maxYear = parseInt(document.getElementById('practiceMax').value);

        if (!guess || guess < minYear || guess > maxYear) {
            alert(`${minYear}から${maxYear}の間で入力してください。`);
            return;
        }

        this.processGuess(guess, true);
        guessInput.value = '';
    }

    // Process guess
    processGuess(guess, isPractice = false) {
        if (this.isGameOver) return;

        this.attempts++;

        let feedback;
        if (guess === this.correctYear) {
            feedback = '正解！';
            this.isGameOver = true;
        } else if (guess > this.correctYear) {
            feedback = '高すぎ';
        } else {
            feedback = '低すぎ';
        }

        const guessItem = {
            number: guess,
            feedback: feedback,
            isCorrect: guess === this.correctYear
        };

        this.guessHistory.push(guessItem);

        if (this.attempts >= this.maxAttempts || this.isGameOver) {
            this.endGame(isPractice);
        }

        this.updateGameDisplay(isPractice);
    }

    // Update game display
    updateGameDisplay(isPractice = false) {
        const prefix = isPractice ? 'practice' : '';
        const suffix = isPractice ? 'Practice' : '';

        // Update attempts left
        const attemptsLeft = document.getElementById(`${prefix}AttemptsLeft`);
        if (attemptsLeft) {
            attemptsLeft.textContent = this.maxAttempts - this.attempts;
        }

        // Update guess history
        const historyContainer = document.getElementById(`${prefix}GuessHistory`);
        if (historyContainer) {
            historyContainer.innerHTML = '';

            this.guessHistory.forEach((guess, index) => {
                const guessElement = document.createElement('div');
                guessElement.className = 'guess-item';

                const feedbackClass = guess.isCorrect ? 'feedback-correct' :
                                     guess.feedback === '高すぎ' ? 'feedback-high' : 'feedback-low';

                guessElement.innerHTML = `
                    <span class="guess-number">${guess.number}</span>
                    <span class="guess-feedback ${feedbackClass}">${guess.feedback}</span>
                `;

                historyContainer.appendChild(guessElement);
            });
        }
    }

    // End game
    endGame(isPractice = false) {
        this.isGameOver = true;
        const prefix = isPractice ? 'practice' : '';

        const gameOverDiv = document.getElementById(`${prefix}GameOver`);
        const gameResult = document.getElementById(`${prefix}GameResult`);
        const answerReveal = document.getElementById(`${prefix}AnswerReveal`);

        if (gameOverDiv && gameResult && answerReveal) {
            const won = this.guessHistory.some(g => g.isCorrect);

            gameResult.textContent = won ? '🎉 おめでとうございます！' : '😢 残念でした...';
            answerReveal.textContent = `正解は ${this.correctYear} 年でした`;

            gameOverDiv.style.display = 'block';
        }
    }

    // Share result
    shareResult() {
        const won = this.guessHistory.some(g => g.isCorrect);
        const attempts = this.attempts;
        const maxAttempts = this.maxAttempts;

        let shareText = `🗺️ Historical Map Dating Game\n`;
        shareText += `${won ? '✅' : '❌'} ${attempts}/${maxAttempts}で${won ? '正解' : '不正解'}\n`;
        shareText += `正解: ${this.correctYear}年\n\n`;

        this.guessHistory.forEach((guess, index) => {
            const emoji = guess.isCorrect ? '🎯' : guess.feedback === '高すぎ' ? '🔺' : '🔻';
            shareText += `${index + 1}. ${guess.number} ${emoji}\n`;
        });

        if (navigator.share) {
            navigator.share({
                title: 'Historical Map Dating Game',
                text: shareText
            });
        } else {
            navigator.clipboard.writeText(shareText).then(() => {
                alert('結果をクリップボードにコピーしました！');
            });
        }
    }

    // Reset game
    resetGame() {
        this.attempts = 0;
        this.guessHistory = [];
        this.isGameOver = false;
        this.correctYear = this.generateDailyYear();

        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('guessInput').value = '';

        this.updateGameDisplay();
        this.loadMapForYear(this.correctYear);
    }

    // Start practice mode
    startPractice() {
        const minYear = parseInt(document.getElementById('practiceMin').value);
        const maxYear = parseInt(document.getElementById('practiceMax').value);

        if (minYear > maxYear) {
            alert('開始年が終了年より大きくなっています。');
            return;
        }

        this.attempts = 0;
        this.guessHistory = [];
        this.isGameOver = false;
        this.correctYear = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;

        document.getElementById('practiceGameOver').style.display = 'none';
        document.getElementById('practiceGuessInput').value = '';

        this.updateGameDisplay(true);
        this.loadMapForYear(this.correctYear);
    }

    // Load settings
    loadSettings() {
        const useOnlineMap = localStorage.getItem('useOnlineMapZ4Settings');
        const maxZoom = localStorage.getItem('maxZoomLevel');

        if (useOnlineMap !== null) {
            this.useOnlineMapZ4 = useOnlineMap === 'true';
            document.getElementById('useOnlineMapZ4Settings').checked = this.useOnlineMapZ4;
        }

        if (maxZoom !== null) {
            this.maxZoomLevel = parseInt(maxZoom);
            document.getElementById('maxZoomLevel').value = this.maxZoomLevel;
        }
    }

    // Save settings
    saveSettings() {
        this.useOnlineMapZ4 = document.getElementById('useOnlineMapZ4Settings').checked;
        this.maxZoomLevel = parseInt(document.getElementById('maxZoomLevel').value);

        localStorage.setItem('useOnlineMapZ4Settings', this.useOnlineMapZ4);
        localStorage.setItem('maxZoomLevel', this.maxZoomLevel);
    }
}

// Global functions for HTML onclick handlers
let game;

function switchMode(mode) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Show/hide modes
    document.getElementById('gameMode').style.display = mode === 'game' ? 'block' : 'none';
    document.getElementById('practiceMode').style.display = mode === 'practice' ? 'block' : 'none';

    if (mode === 'settings') {
        document.getElementById('settingsModal').style.display = 'block';
    }

    game.mode = mode;

    if (mode === 'game') {
        game.resetGame();
    }
}

function makeGuess() {
    game.makeGuess();
}

function makePracticeGuess() {
    game.makePracticeGuess();
}

function shareResult() {
    game.shareResult();
}

function resetGame() {
    game.resetGame();
}

function startPractice() {
    game.startPractice();
}

function saveSettings() {
    game.saveSettings();
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    game = new HistoricalMapGame();

    // Close modal when clicking outside
    window.onclick = function(event) {
        const modal = document.getElementById('settingsModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
});