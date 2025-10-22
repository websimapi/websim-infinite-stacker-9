export class UIManager {
    constructor() {
        this.scoreElement = document.getElementById('score');
        this.instructionsElement = document.getElementById('instructions');
        this.gameOverElement = document.getElementById('game-over');
        this.finalScoreElement = document.getElementById('final-score');
        this.restartButton = document.getElementById('restart-button');
        this.replayButton = document.getElementById('replay-button');
        this.replayViewer = document.getElementById('replay-viewer');
        this.replayVideo = document.getElementById('replay-video');
        this.closeReplayButton = document.getElementById('close-replay');
        this.downloadReplayButton = document.getElementById('download-replay');
        this.replayControlsElement = document.getElementById('replay-controls');
        this.submitScoreButton = document.getElementById('submit-score-button');
        this.viewLeaderboardButton = document.getElementById('view-leaderboard-button');

        // Leaderboard elements
        this.leaderboardView = document.getElementById('leaderboard-view');
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.leaderboardPagination = document.getElementById('leaderboard-pagination');
        this.leaderboardPrevButton = document.getElementById('leaderboard-prev');
        this.leaderboardNextButton = document.getElementById('leaderboard-next');
        this.leaderboardPageInfo = document.getElementById('leaderboard-page-info');
        this.closeLeaderboardButton = document.getElementById('close-leaderboard');

        this.currentReplayBlob = null;
    }

    setupEventListeners({ onPointerDown, onRestart, onViewReplay, onWindowResize, onSubmitScore, onViewLeaderboard }) {
        window.addEventListener('pointerdown', onPointerDown);
        this.restartButton.addEventListener('click', onRestart);
        this.replayButton.addEventListener('click', onViewReplay);
        this.closeReplayButton.addEventListener('click', () => this.hideReplayViewer());
        this.downloadReplayButton.addEventListener('click', () => this.downloadReplay());
        window.addEventListener('resize', onWindowResize, false);
        this.submitScoreButton.addEventListener('click', onSubmitScore);
        this.viewLeaderboardButton.addEventListener('click', onViewLeaderboard);
        this.closeLeaderboardButton.addEventListener('click', () => this.hideLeaderboard());
    }

    updateScore(score) {
        this.scoreElement.innerText = score;
    }

    showInstructions(visible) {
        if (visible) {
            this.instructionsElement.classList.remove('hidden');
        } else {
            this.instructionsElement.classList.add('hidden');
        }
    }

    showGameOver(score) {
        this.finalScoreElement.innerText = score;
        this.gameOverElement.classList.remove('hidden');
        this.replayControlsElement.classList.remove('hidden');
        this.setSubmitButtonState(false, 'Submit Score');
    }

    hideGameOver() {
        this.gameOverElement.classList.add('hidden');
        this.replayControlsElement.classList.add('hidden');
        this.updateScore(0);
        this.showInstructions(true);
    }

    showReplayViewer(source) {
        this.currentReplayBlob = null;
        let url;
        
        if (source instanceof Blob) {
            this.currentReplayBlob = source;
            url = URL.createObjectURL(source);
            this.downloadReplayButton.style.display = 'block';
        } else if (typeof source === 'string') {
            url = source;
            this.downloadReplayButton.style.display = 'none';
        } else {
            console.error("Invalid source for replay viewer");
            return;
        }

        this.replayVideo.src = url;
        this.gameOverElement.classList.add('hidden');
        this.replayViewer.classList.remove('hidden');
        this.leaderboardView.classList.add('hidden');
    }

    hideReplayViewer() {
        this.replayViewer.classList.add('hidden');
        
        if (this.leaderboardView.classList.contains('hidden')) {
             this.gameOverElement.classList.remove('hidden');
        } else {
            this.leaderboardView.classList.remove('hidden');
        }

        if (this.replayVideo.src && this.replayVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.replayVideo.src);
        }
        this.replayVideo.src = '';
    }
    
    downloadReplay() {
        if (!this.currentReplayBlob) return;
        
        const url = URL.createObjectURL(this.currentReplayBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stacker-replay-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    setReplayButtonState(disabled, text) {
        this.replayButton.disabled = disabled;
        this.replayButton.textContent = text;
    }

    setSubmitButtonState(disabled, text) {
        this.submitScoreButton.disabled = disabled;
        this.submitScoreButton.textContent = text;
    }

    showLeaderboard() {
        this.leaderboardView.classList.remove('hidden');
        this.gameOverElement.classList.add('hidden');
    }

    hideLeaderboard() {
        this.leaderboardView.classList.add('hidden');
        this.gameOverElement.classList.remove('hidden');
    }

    renderLeaderboard(scores, page, itemsPerPage, onViewReplayCallback) {
        this.leaderboardList.innerHTML = '';
        if (scores.length === 0) {
            this.leaderboardList.innerHTML = '<li class="no-scores">No scores yet. Be the first!</li>';
        }

        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedScores = scores.slice(start, end);

        paginatedScores.forEach((scoreData, index) => {
            const rank = start + index + 1;
            const li = document.createElement('li');
            li.classList.add('leaderboard-item');
            li.innerHTML = `
                <div class="leaderboard-rank">${rank}</div>
                <img src="https://images.websim.com/avatar/${scoreData.username}" class="leaderboard-avatar" alt="${scoreData.username}'s avatar">
                <div class="leaderboard-username">${scoreData.username}</div>
                <div class="leaderboard-score">${scoreData.score}</div>
            `;
            li.addEventListener('click', () => onViewReplayCallback(scoreData.replay_url));
            this.leaderboardList.appendChild(li);
        });

        this.leaderboardPageInfo.textContent = `Page ${page}`;
        this.leaderboardPrevButton.disabled = page === 1;
        this.leaderboardNextButton.disabled = end >= scores.length;
    }
}