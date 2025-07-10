const MAP_MIN_YEAR = 1;
const MAP_MAX_YEAR = 2022;
if (typeof loadMapForYear !== 'function') {
    window.loadMapForYear = (year) => { console.warn(`map.js: loadMapForYear(${year}) function not found. Using dummy.`); };
}
if (typeof getCurrentMapYear !== 'function') {
    window.getCurrentMapYear = () => { console.warn('map.js: getCurrentMapYear() function not found. Using dummy.'); return 0; };
}

document.addEventListener('DOMContentLoaded', () => {
    const dailyButton = document.getElementById('dailyButton');
    const practiceButton = document.getElementById('practiceButton');
    const settingsButton = document.getElementById('settingsButton');
    const playContent = document.getElementById('playContent');
    const settingsContent = document.getElementById('settingsContent');

    const yearInput = document.getElementById('yearInput');
    const submitGuessButton = document.getElementById('submitGuess');
    const historyList = document.getElementById('historyList');
    const guessPrompt = document.getElementById('guessPrompt');
    const shareButton = document.getElementById('shareButton');
    const playAgainButton = document.getElementById('playAgainButton');
    const notificationPopup = document.getElementById('notification');

    const startYearSetting = document.getElementById('startYearSetting');
    const endYearSetting = document.getElementById('endYearSetting');

    let gameMode = 'daily';
    let currentTargetYear = null;
    let guesses = [];
    const MAX_GUESSES = 6;

    let practiceState = {
        targetYear: null,
        guesses: []
    };

    function getTodayYyyymmdd() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    function getDailyTargetYear() {
        const today = getTodayYyyymmdd();
        let seed = parseInt(today);
        const a = 1103515245;
        const c = 12345;
        const m = 2**31;
        seed = (a * seed + c) % m;
        return (seed % (MAP_MAX_YEAR - MAP_MIN_YEAR + 1)) + MAP_MIN_YEAR;
    }

    function getDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    function getRandomYear(min, max) {
        if (min > max) [min, max] = [max, min];
        min = Math.max(min, MAP_MIN_YEAR);
        max = Math.min(max, MAP_MAX_YEAR);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function loadDailyData() {
        const data = localStorage.getItem('daily');
        if (data) {
            return JSON.parse(data);
        }
        return {};
    }

    function saveDailyData(data) {
        localStorage.setItem('daily', JSON.stringify(data));
    }

    let notificationTimeout;
    function showNotification(message, duration = 2000) {
        notificationPopup.textContent = message;
        notificationPopup.classList.add('show');
        clearTimeout(notificationTimeout);
        notificationTimeout = setTimeout(() => {
            notificationPopup.classList.remove('show');
        }, duration);
    }

    function updateHistoryDisplay() {
        historyList.innerHTML = '';
        if (guesses.length === 0) {
            historyList.innerHTML = '<li>You haven\'t guessed yet</li>';
            return;
        }
        guesses.forEach((guess, index) => {
            const listItem = document.createElement('li');
            const diff = Math.abs(guess - currentTargetYear);
            let feedbackText = '';
            let className = '';

            if (guess === currentTargetYear) {
                feedbackText = ' (Correct!🎉)';
                className = 'correct-guess';
            } else if (guess > currentTargetYear) {
                if (diff <= 10) {
                    feedbackText = '⬇️ Super close!';
                } else if (diff <= 50) {
                    feedbackText = '⬇️ Pretty close!';
                } else {
                    feedbackText = '⬇️ Too far';
                }
                className = 'too-high-guess';
            } else {
                if (diff <= 10) {
                    feedbackText = '⬆️ Super close!';
                } else if (diff <= 50) {
                    feedbackText = '⬆️ Pretty close!';
                } else {
                    feedbackText = '⬆️ Too far';
                }
                className = 'too-low-guess';
            }

            listItem.textContent = `${index + 1}. ${guess} - ${feedbackText}`;
            listItem.classList.add(className);
            historyList.appendChild(listItem);
        });
        historyList.parentElement.scrollTop = historyList.parentElement.scrollHeight;
    }

    function endGame(isSolved) {
        yearInput.disabled = true;
        submitGuessButton.disabled = true;
        shareButton.style.display = 'inline-block';
        if (gameMode === 'practice') {
            playAgainButton.style.display = 'inline-block';
        }
        if (isSolved) {
            guessPrompt.textContent = `Correct! It was ${currentTargetYear}!`;
        } else {
            guessPrompt.textContent = `The answer was ${currentTargetYear}`;
        }
    }

    function resetGameUI() {
        yearInput.value = '';
        yearInput.disabled = false;
        submitGuessButton.disabled = false;
        shareButton.style.display = 'none';
        playAgainButton.style.display = 'none';
        historyList.innerHTML = '';
        guessPrompt.textContent = getDate();
    }

    function processGuess() {
        const guess = parseInt(yearInput.value);

        if (isNaN(guess) || guess < MAP_MIN_YEAR || guess > MAP_MAX_YEAR) {
            showNotification(`Please enter a valid year (${MAP_MIN_YEAR} to ${MAP_MAX_YEAR}).`);
            return;
        }

        if (guesses.includes(guess)) {
            showNotification('That year has already been guessed.');
            return;
        }

        guesses.push(guess);
        updateHistoryDisplay();
        yearInput.value = '';

        let isSolved = false;
        if (guess === currentTargetYear) {
            isSolved = true;
            endGame(true);
        } else {
            const diff = Math.abs(guess - currentTargetYear);
            if (guess > currentTargetYear) {
                if (diff <= 10) { showNotification('Close! A little too new.'); }
                else if (diff <= 50) { showNotification('A bit too new.'); }
                else { showNotification('Too new.'); }
            } else {
                if (diff <= 10) { showNotification('Close! A little too old.'); }
                else if (diff <= 50) { showNotification('A bit too old.'); }
                else { showNotification('Too old.'); }
            }
        }

        if (gameMode === 'daily') {
            const todayData = loadDailyData();
            todayData[getTodayYyyymmdd()] = {
                targetYear: currentTargetYear,
                guesses: guesses,
                isSolved: isSolved
            };
            saveDailyData(todayData);
        } else if (gameMode === 'practice') {
            practiceState.guesses = guesses;
        }

        if (!isSolved && guesses.length >= MAX_GUESSES) {
            endGame(false);
        }

        if (!isSolved) {
            loadMapForYear(currentTargetYear);
        }
    }

    submitGuessButton.addEventListener('click', processGuess);

    yearInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            processGuess();
        }
    });

    // ここからshareボタンの修正
    shareButton.addEventListener('click', () => {
        const shareText = `Historical Map Guessing Game - ${gameMode === 'daily' ? 'Daily' : 'Practice Mode'}\n`;
        let resultText = '';
        if (guesses[guesses.length - 1] === currentTargetYear) {
            resultText = `Correct! Solved in ${guesses.length} guesses! 🎉`;
        } else {
            resultText = `Failed to solve. ${MAX_GUESSES} guesses used. The answer was ${currentTargetYear}.`;
        }
        const guessesList = guesses.map((g, i) => {
            const diff = Math.abs(g - currentTargetYear);
            if (g === currentTargetYear) return `${i + 1}. ${g} (Correct!🎉)`;
            if (g > currentTargetYear) {
                if (diff <= 10) return `${i + 1}. ${g} (Close! A little too new)`;
                if (diff <= 50) return `${i + 1}. ${g} (A bit too new)`;
                return `${i + 1}. ${g} (Too new)`;
            } else {
                if (diff <= 10) return `${i + 1}. ${g} (Close! A little too old)`;
                if (diff <= 50) return `${i + 1}. ${g} (A bit too old)`;
                return `${i + 1}. ${g} (Too old)`;
            }
        }).join('\n');

        const finalMessage = `${shareText}\n${resultText}\n\nYour guesses:\n${guessesList}\n\n#HistoricalMapDating\n${window.location.href}`; // URLもメッセージに含める

        // クリップボードにコピー
        navigator.clipboard.writeText(finalMessage).then(() => {
            const originalText = shareButton.textContent; // 元のテキストを保存
            shareButton.textContent = 'Copied!'; // ボタンのテキストを変更
            setTimeout(() => {
                shareButton.textContent = originalText; // 数秒後に元のテキストに戻す
            }, 2000); // 2秒間表示
        }).catch((err) => {
            console.error('Failed to copy to clipboard:', err);
            showNotification('Failed to copy results.');
        });
    });
    // ここまでshareボタンの修正

    playAgainButton.addEventListener('click', () => {
        practiceState.targetYear = null;
        practiceState.guesses = [];
        startPracticeGame();
    });

    function startDailyGame() {
        gameMode = 'daily';
        resetGameUI();

        const today = getTodayYyyymmdd();
        const dailyData = loadDailyData();

        let sessionData = dailyData[today];

        if (sessionData) {
            currentTargetYear = sessionData.targetYear;
            guesses = sessionData.guesses || [];
            updateHistoryDisplay();

            if (sessionData.isSolved || guesses.length >= MAX_GUESSES) {
                endGame(sessionData.isSolved);
            }
        } else {
            currentTargetYear = getDailyTargetYear();
            guesses = [];
            dailyData[today] = {
                targetYear: currentTargetYear,
                guesses: [],
                isSolved: false
            };
            saveDailyData(dailyData);
        }

        loadMapForYear(currentTargetYear);
    }

    function startPracticeGame() {
        gameMode = 'practice';
        resetGameUI();

        if (practiceState.targetYear && practiceState.guesses.length < MAX_GUESSES &&
            !(practiceState.guesses.length > 0 && practiceState.guesses[practiceState.guesses.length - 1] === practiceState.targetYear)) {
            currentTargetYear = practiceState.targetYear;
            guesses = practiceState.guesses;
        } else {
            let minYear = parseInt(startYearSetting.value);
            let endYear = parseInt(endYearSetting.value);

            if (isNaN(minYear) || minYear < MAP_MIN_YEAR) minYear = MAP_MIN_YEAR;
            if (isNaN(endYear) || endYear > MAP_MAX_YEAR) endYear = MAP_MAX_YEAR;
            if (minYear > endYear) [minYear, endYear] = [endYear, minYear];

            currentTargetYear = getRandomYear(minYear, endYear);
            guesses = [];

            practiceState.targetYear = currentTargetYear;
            practiceState.guesses = guesses;
        }

        updateHistoryDisplay();
        loadMapForYear(currentTargetYear);

        if (guesses.length > 0 && (guesses[guesses.length - 1] === currentTargetYear || guesses.length >= MAX_GUESSES)) {
            endGame(guesses[guesses.length - 1] === currentTargetYear);
        }
    }

    const navButtons = [dailyButton, practiceButton, settingsButton];
    const sideContents = [playContent, settingsContent];

    function activateTab(activeButton, activeContent) {
        navButtons.forEach(button => button.classList.remove('active'));
        activeButton.classList.add('active');

        sideContents.forEach(content => content.classList.remove('active'));
        activeContent.classList.add('active');

        if (activeContent === playContent) {
            if (activeButton === dailyButton) {
                startDailyGame();
            } else if (activeButton === practiceButton) {
                startPracticeGame();
            }
        }
    }

    dailyButton.addEventListener('click', () => {
        activateTab(dailyButton, playContent);
    });

    practiceButton.addEventListener('click', () => {
        activateTab(practiceButton, playContent);
    });

    settingsButton.addEventListener('click', () => {
        activateTab(settingsButton, settingsContent);
    });

    activateTab(dailyButton, playContent);
});