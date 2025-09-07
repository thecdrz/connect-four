class Connect4Game {
    constructor() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1;
        this.gameActive = false;
    this.inRoom = false; // distinguishes having joined/created a room vs just connected to server
        this.isMyTurn = false;
        this.myPlayerNumber = null;
        this.myPlayerName = null;
        this.opponentName = null;
        this.socket = null;
        this.gameId = null;
        this.pendingAction = null; // 'create' or 'join'
        this.audioEnabled = true;
        this.sounds = {};
        
        this.initializeAudio();
        
        this.initializeGame();
        this.initializeSocket();
        this.setupEventListeners();
    }

    initializeGame() {
        this.createBoard();
        this.updateStatus('Connecting to server...');
        this.disableChatInput();
    this.updateControlButtons();
    }

    initializeAudio() {
        // We'll create audio using Web Audio API or simple Audio objects
        // For now, we'll use simple Audio objects with data URLs (we'll enhance this)
        this.sounds = {
            drop: this.createBeepSound(400, 0.1), // Drop piece sound
            win: this.createBeepSound(800, 0.3),  // Win sound
            click: this.createBeepSound(600, 0.05), // Button click
            connect: this.createBeepSound(500, 0.1), // Connection sound
            chat: this.createBeepSound(300, 0.05), // Chat message
        };
    }

    createBeepSound(frequency, duration) {
        // Simple beep sound generator
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            return {
                play: () => {
                    if (!this.audioEnabled) return;
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    oscillator.frequency.value = frequency;
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
                    
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + duration);
                }
            };
        } catch (e) {
            // Fallback for browsers that don't support Web Audio API
            return { play: () => {} };
        }
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected', 'Connected');
            this.updateStatus('Connected! Click "New Game" or "Join Game" to start playing.');
            this.sounds.connect.play();
            this.inRoom = false; // fresh connection not in a room
            this.gameActive = false;
            this.updateControlButtons();
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.updateStatus('Disconnected from server');
            this.gameActive = false;
            this.inRoom = false;
            this.updateControlButtons();
        });

        this.socket.on('gameCreated', (data) => {
            this.gameId = data.gameId;
            this.myPlayerNumber = 1;
            this.myPlayerName = data.playerName;
            this.inRoom = true;
            // Avoid duplicating room code (shown separately in #room-info)
            this.updateStatus('Game created! Waiting for another player to join...');
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
            this.hideNameModal();
            this.enableChatInput();
            this.updateControlButtons();
        });

        this.socket.on('gameJoined', (data) => {
            this.gameId = data.gameId;
            this.myPlayerNumber = data.playerNumber;
            this.myPlayerName = data.playerName;
            this.inRoom = true;
            this.updateStatus('Joined game! Starting...');
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
            this.hideNameModal();
            this.enableChatInput();
            this.updateControlButtons();
        });

        this.socket.on('gameStart', (data) => {
            this.gameActive = true;
            this.currentPlayer = 1;
            this.isMyTurn = this.myPlayerNumber === 1;
            this.resetBoard();
            this.updatePlayerIndicators();
            this.updateStatus(this.isMyTurn ? 'Your turn!' : "Opponent's turn");
            this.updateControlButtons();
        });

        this.socket.on('moveMade', (data) => {
            this.makeMove(data.col, data.player, false);
            if (data.player !== this.myPlayerNumber) {
                this.sounds.drop.play();
            }
        });

        this.socket.on('gameWon', (data) => {
            this.gameActive = false;
            const isWinner = data.winner === this.myPlayerNumber;
            this.highlightWinningCells(data.winningCells);
            const winnerName = data.winnerName || `Player ${data.winner}`;
            
            // Play win sound
            this.sounds.win.play();
            
            this.showModal(
                isWinner ? '🎉 You Won!' : '😔 You Lost!',
                isWinner ? 
                    `Congratulations ${winnerName}! You won the game!` : 
                    `${winnerName} won this game. Better luck next time!`
            );
        });

        this.socket.on('gameDraw', () => {
            this.gameActive = false;
            this.showModal('Game Draw!', "It's a tie! Good game!");
        });

        this.socket.on('playerDisconnected', () => {
            this.gameActive = false;
            this.updateStatus('Opponent disconnected');
            // Still in room; allow leave button only
            this.updateControlButtons();
        });

        this.socket.on('playersUpdated', (data) => {
            this.updatePlayerNames(data.players);
        });

        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data);
            if (data.playerNumber !== this.myPlayerNumber) {
                this.sounds.chat.play();
            }
        });

        this.socket.on('leaderboard', (data) => {
            this.showLeaderboard(data);
        });

        this.socket.on('error', (error) => {
            this.updateStatus(`Error: ${error.message}`);
        });
    }

    setupEventListeners() {
        // Step 1: Game mode selection (now unused - kept for potential back navigation)
        document.getElementById('select-new-game').addEventListener('click', () => {
            this.sounds.click.play();
            this.showNameStep('create');
        });

        document.getElementById('select-join-game').addEventListener('click', () => {
            this.sounds.click.play();
            this.showNameStep('join');
        });

        // Step 2: Name input
        document.getElementById('proceed-with-name').addEventListener('click', () => {
            this.sounds.click.play();
            this.handleNameSubmission();
        });

        document.getElementById('back-to-mode').addEventListener('click', () => {
            this.sounds.click.play();
            this.hideNameModal();
        });

        // Step 3: Room code (join only)
        document.getElementById('connect-to-game').addEventListener('click', () => {
            this.sounds.click.play();
            this.handleRoomCodeSubmission();
        });

        document.getElementById('back-to-name').addEventListener('click', () => {
            this.sounds.click.play();
            this.showNameStep(this.pendingAction);
        });

        document.getElementById('player-name').addEventListener('input', () => {
            this.validateNameInput();
        });

        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const button = document.getElementById('proceed-with-name');
                if (!button.disabled) {
                    this.handleNameSubmission();
                }
            }
        });

        document.getElementById('room-code-input').addEventListener('input', () => {
            this.validateRoomCodeInput();
        });

        document.getElementById('room-code-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const button = document.getElementById('connect-to-game');
                if (!button.disabled) {
                    this.handleRoomCodeSubmission();
                }
            }
        });

        // Main game button listeners (outside modal) - directly go to name step
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.sounds.click.play();
            this.showNameModal();
            this.showNameStep('create');
        });

        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.sounds.click.play();
            this.showNameModal();
            this.showNameStep('join');
        });

        // Leaderboard button
        document.getElementById('show-leaderboard').addEventListener('click', () => {
            if (this.socket) {
                this.socket.emit('getLeaderboard');
            }
        });

        // Chat listeners
        document.getElementById('send-chat').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Modal close listeners
        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('leaderboard-close').addEventListener('click', () => {
            this.hideLeaderboardModal();
        });

        document.getElementById('name-modal-close').addEventListener('click', () => {
            this.hideNameModal();
        });

        // Audio toggle
        document.getElementById('audio-toggle').addEventListener('click', () => {
            this.toggleAudio();
        });

        // Leave game button
        document.getElementById('leave-game-btn').addEventListener('click', () => {
            this.sounds.click.play();
            this.showLeaveConfirmation();
        });

        // Leave game confirmation
        document.getElementById('confirm-leave').addEventListener('click', () => {
            this.sounds.click.play();
            this.leaveGame();
        });

        document.getElementById('cancel-leave').addEventListener('click', () => {
            this.sounds.click.play();
            this.hideLeaveConfirmation();
        });
    }

    createBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';

        // Create column headers (for clicking)
        for (let col = 0; col < 7; col++) {
            const header = document.createElement('div');
            header.className = 'column-header';
            header.textContent = col + 1;
            header.addEventListener('click', () => this.dropPiece(col));
            boardElement.appendChild(header);
        }

        // Create board cells
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                cell.addEventListener('click', () => this.dropPiece(col));
                boardElement.appendChild(cell);
            }
        }
    }

    dropPiece(col) {
        if (!this.gameActive || !this.isMyTurn) {
            return;
        }

        if (this.isColumnFull(col)) {
            return;
        }

        // Send move to server
        this.socket.emit('makeMove', { 
            gameId: this.gameId, 
            col: col,
            player: this.myPlayerNumber
        });
    }

    makeMove(col, player, isLocalMove = true) {
        const row = this.getBottomEmptyRow(col);
        if (row === -1) return false;

        // Update board state
        this.board[row][col] = player;
        
        // Update UI with animation
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        const colorClass = player === 1 ? 'red' : 'yellow';
        
        // Add drop animation
        cell.classList.add('dropping', colorClass);
        
        // Play drop sound for local moves
        if (isLocalMove) {
            this.sounds.drop.play();
        }
        
        // Check for win
        if (this.checkWin(row, col, player)) {
            const winningCells = this.getWinningCells(row, col, player);
            if (isLocalMove) {
                this.socket.emit('gameWon', { 
                    gameId: this.gameId, 
                    winner: player,
                    winningCells: winningCells
                });
            }
            return true;
        }

        // Check for draw
        if (this.isBoardFull()) {
            if (isLocalMove) {
                this.socket.emit('gameDraw', { gameId: this.gameId });
            }
            return true;
        }

        // Switch turns
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.isMyTurn = !this.isMyTurn;
        this.updatePlayerIndicators();
        this.updateStatus(this.isMyTurn ? 'Your turn!' : "Opponent's turn");

        return true;
    }

    getBottomEmptyRow(col) {
        for (let row = 5; row >= 0; row--) {
            if (this.board[row][col] === 0) {
                return row;
            }
        }
        return -1;
    }

    isColumnFull(col) {
        return this.board[0][col] !== 0;
    }

    isBoardFull() {
        return this.board[0].every(cell => cell !== 0);
    }

    checkWin(row, col, player) {
        return this.checkDirection(row, col, player, 0, 1) ||  // horizontal
               this.checkDirection(row, col, player, 1, 0) ||  // vertical
               this.checkDirection(row, col, player, 1, 1) ||  // diagonal \
               this.checkDirection(row, col, player, 1, -1);   // diagonal /
    }

    checkDirection(row, col, player, deltaRow, deltaCol) {
        let count = 1;
        
        // Check positive direction
        let r = row + deltaRow;
        let c = col + deltaCol;
        while (r >= 0 && r < 6 && c >= 0 && c < 7 && this.board[r][c] === player) {
            count++;
            r += deltaRow;
            c += deltaCol;
        }
        
        // Check negative direction
        r = row - deltaRow;
        c = col - deltaCol;
        while (r >= 0 && r < 6 && c >= 0 && c < 7 && this.board[r][c] === player) {
            count++;
            r -= deltaRow;
            c -= deltaCol;
        }
        
        return count >= 4;
    }

    getWinningCells(row, col, player) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        
        for (let [deltaRow, deltaCol] of directions) {
            const cells = [{row, col}];
            
            // Check positive direction
            let r = row + deltaRow;
            let c = col + deltaCol;
            while (r >= 0 && r < 6 && c >= 0 && c < 7 && this.board[r][c] === player) {
                cells.push({row: r, col: c});
                r += deltaRow;
                c += deltaCol;
            }
            
            // Check negative direction
            r = row - deltaRow;
            c = col - deltaCol;
            while (r >= 0 && r < 6 && c >= 0 && c < 7 && this.board[r][c] === player) {
                cells.push({row: r, col: c});
                r -= deltaRow;
                c -= deltaCol;
            }
            
            if (cells.length >= 4) {
                return cells;
            }
        }
        
        return [];
    }

    highlightWinningCells(winningCells) {
        winningCells.forEach(({row, col}) => {
            const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
                cell.classList.add('winning');
            }
        });
    }

    resetBoard() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1;
        
        // Clear visual board
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.classList.remove('red', 'yellow', 'winning');
        });
    }

    updatePlayerIndicators() {
        const player1 = document.querySelector('.player1');
        const player2 = document.querySelector('.player2');
        
        player1.classList.toggle('active', this.currentPlayer === 1);
        player2.classList.toggle('active', this.currentPlayer === 2);
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }

    updateConnectionStatus(status, text) {
        const indicator = document.getElementById('connection-indicator');
        const statusText = document.getElementById('connection-text');
        
        indicator.className = status;
        statusText.textContent = text;
    }

    showModal(title, message) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        document.getElementById('modal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    // Name modal functions
    showNameModal() {
        // Always reset modal state first to ensure clean start
        this.resetModal();
        document.getElementById('name-modal').classList.remove('hidden');
    }

    hideNameModal() {
        document.getElementById('name-modal').classList.add('hidden');
        this.resetModal();
    }

    resetModal() {
        // Clear all form inputs
        document.getElementById('player-name').value = '';
        document.getElementById('room-code-input').value = '';
        
        // Reset input validation classes
        document.getElementById('player-name').classList.remove('error', 'success');
        document.getElementById('room-code-input').classList.remove('error', 'success');
        
        // Hide all steps when resetting
        document.getElementById('game-mode-selection').classList.add('hidden');
        document.getElementById('name-input-step').classList.add('hidden');
        document.getElementById('room-code-step').classList.add('hidden');
        
        this.pendingAction = null;
    }

    showGameModeStep() {
        // Hide all steps
        document.getElementById('game-mode-selection').classList.remove('hidden');
        document.getElementById('name-input-step').classList.add('hidden');
        document.getElementById('room-code-step').classList.add('hidden');
        
        // Reset title and subtitle
        document.getElementById('modal-title').innerHTML = '🎮 Welcome to Connect 4!';
        document.getElementById('modal-subtitle').textContent = 'Choose how you want to play';
    }

    showNameStep(mode) {
        this.pendingAction = mode;
        
        // Hide other steps, show name step
        document.getElementById('game-mode-selection').classList.add('hidden');
        document.getElementById('name-input-step').classList.remove('hidden');
        document.getElementById('room-code-step').classList.add('hidden');
        
        // Update title and button text based on mode
        if (mode === 'create') {
            document.getElementById('modal-title').innerHTML = '🎆 Create New Game';
            document.getElementById('modal-subtitle').textContent = 'Enter your name to start a new game';
            document.getElementById('proceed-text').textContent = 'Begin Game';
            document.getElementById('proceed-icon').textContent = '🎆';
        } else {
            document.getElementById('modal-title').innerHTML = '🚀 Join Game';
            document.getElementById('modal-subtitle').textContent = 'Enter your name to join a game';
            document.getElementById('proceed-text').textContent = 'Continue';
            document.getElementById('proceed-icon').textContent = '🚀';
        }
        
        // Focus on name input and validate
        document.getElementById('player-name').focus();
        this.validateNameInput();
    }

    showRoomCodeStep() {
        // Hide other steps, show room code step
        document.getElementById('game-mode-selection').classList.add('hidden');
        document.getElementById('name-input-step').classList.add('hidden');
        document.getElementById('room-code-step').classList.remove('hidden');
        
        // Update title
        document.getElementById('modal-title').innerHTML = '🔑 Enter Room Code';
        document.getElementById('modal-subtitle').textContent = 'Ask your friend for the room code';
        
        // Focus on room code input and validate
        document.getElementById('room-code-input').focus();
        this.validateRoomCodeInput();
    }

    handleNameSubmission() {
        const playerName = document.getElementById('player-name').value.trim();
        
        if (!this.socket) {
            this.showError('Not connected to server');
            return;
        }

        if (this.pendingAction === 'create') {
            // Create game immediately
            this.socket.emit('createGame', { playerName });
        } else {
            // Show room code step for joining
            this.showRoomCodeStep();
        }
    }

    handleRoomCodeSubmission() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
        
        if (!this.socket) {
            this.showError('Not connected to server');
            return;
        }

        this.socket.emit('joinGame', { gameId: roomCode, playerName });
    }

    validateNameInput() {
        const playerNameInput = document.getElementById('player-name');
        const playerName = playerNameInput.value.trim();
        const proceedButton = document.getElementById('proceed-with-name');
        
        // Validate player name (2-15 characters)
        let nameValid = playerName.length >= 2 && playerName.length <= 15;
        playerNameInput.classList.remove('error', 'success');
        if (playerName.length > 0) {
            playerNameInput.classList.add(nameValid ? 'success' : 'error');
        }
        
        proceedButton.disabled = !nameValid;
        proceedButton.style.opacity = nameValid ? '1' : '0.6';
    }

    validateRoomCodeInput() {
        const roomCodeInput = document.getElementById('room-code-input');
        const roomCode = roomCodeInput.value.trim();
        const connectButton = document.getElementById('connect-to-game');
        
        // Validate room code
        let codeValid = roomCode.length === 6;
        roomCodeInput.classList.remove('error', 'success');
        if (roomCode.length > 0) {
            roomCodeInput.classList.add(codeValid ? 'success' : 'error');
        }
        
        connectButton.disabled = !codeValid;
        connectButton.style.opacity = codeValid ? '1' : '0.6';
    }

    // Removed executeAction - replaced with handleNameSubmission and handleRoomCodeSubmission

    showError(message) {
        const subtitle = document.getElementById('modal-subtitle');
        const modalContent = document.querySelector('#name-modal .modal-content');
        
        // Shake animation for error feedback
        modalContent.style.animation = 'shake 0.5s ease-in-out';
        
        subtitle.textContent = `⚠️ ${message}`;
        subtitle.style.color = '#e74c3c';
        
        setTimeout(() => {
            modalContent.style.animation = '';
            subtitle.style.color = '';
            if (this.pendingAction === 'create') {
                subtitle.textContent = 'Start a new game and share the room code with friends!';
            } else {
                subtitle.textContent = 'Enter the room code to join an existing game!';
            }
        }, 3000);
    }

    // Player name functions
    updatePlayerNames(players) {
        players.forEach(player => {
            const nameElement = document.getElementById(`player${player.number}-name`);
            if (nameElement) {
                nameElement.textContent = `${player.name} (${player.number === 1 ? 'Red' : 'Yellow'})`;
                if (player.number !== this.myPlayerNumber) {
                    this.opponentName = player.name;
                }
            }
        });
    }

    // Chat functions
    enableChatInput() {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-chat');
        chatInput.disabled = false;
        sendButton.disabled = false;
    }

    disableChatInput() {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-chat');
        chatInput.disabled = true;
        sendButton.disabled = true;
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message || !this.socket || !this.gameId) {
            return;
        }

        this.socket.emit('sendChatMessage', { gameId: this.gameId, message });
        input.value = '';
    }

    addChatMessage(data) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${data.playerNumber === this.myPlayerNumber ? 'own' : 'other'}`;
        
        const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="player-name">${data.playerName}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${this.escapeHtml(data.message)}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Leaderboard functions
    showLeaderboard(data) {
        const content = document.getElementById('leaderboard-content');
        
        if (data.length === 0) {
            content.innerHTML = '<p class="no-data">No games played yet!</p>';
        } else {
            let html = '<div class="leaderboard-table">';
            html += '<div class="leaderboard-header">';
            html += '<span>Rank</span><span>Player</span><span>Wins</span><span>Win Rate</span>';
            html += '</div>';
            
            data.forEach((player, index) => {
                const rank = index + 1;
                const trophy = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
                html += `<div class="leaderboard-row ${player.name === this.myPlayerName ? 'highlight' : ''}">`;
                html += `<span class="rank">${trophy}</span>`;
                html += `<span class="player">${this.escapeHtml(player.name)}</span>`;
                html += `<span class="wins">${player.wins}</span>`;
                html += `<span class="win-rate">${player.winRate}%</span>`;
                html += '</div>';
            });
            html += '</div>';
            content.innerHTML = html;
        }
        
        document.getElementById('leaderboard-modal').classList.remove('hidden');
    }

    hideLeaderboardModal() {
        document.getElementById('leaderboard-modal').classList.add('hidden');
    }

    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        const button = document.getElementById('audio-toggle');
        button.innerHTML = this.audioEnabled ? '🔊 Audio: ON' : '🔇 Audio: OFF';
        button.style.opacity = this.audioEnabled ? '1' : '0.6';
        
        // Play a test sound when enabling
        if (this.audioEnabled) {
            this.sounds.click.play();
        }
    }

    // Button state management
    updateControlButtons() {
        const newBtn = document.getElementById('new-game-btn');
        const joinBtn = document.getElementById('join-game-btn');
        const leaveBtn = document.getElementById('leave-game-btn');
        // States:
        // 1. Not in room: show New & Join only.
        // 2. In room but game not active (waiting/opponent left): show Leave only.
        // 3. In active game: show Leave only.
        if (!this.inRoom) {
            newBtn.classList.remove('hidden');
            joinBtn.classList.remove('hidden');
            leaveBtn.classList.add('hidden');
        } else {
            newBtn.classList.add('hidden');
            joinBtn.classList.add('hidden');
            leaveBtn.classList.remove('hidden');
        }
    }

    // Leave game confirmation
    showLeaveConfirmation() {
        const message = document.getElementById('leave-message');
        if (this.gameActive) {
            message.textContent = 'The game is currently in progress. Are you sure you want to leave?';
        } else {
            message.textContent = 'Are you sure you want to leave the current game?';
        }
        document.getElementById('leave-confirmation-modal').classList.remove('hidden');
    }

    hideLeaveConfirmation() {
        document.getElementById('leave-confirmation-modal').classList.add('hidden');
    }

    leaveGame() {
        // Disconnect from current game
        if (this.socket && this.gameId) {
            this.socket.disconnect();
            
            // Reconnect to server but not to game
            setTimeout(() => {
                this.socket.connect();
            }, 100);
        }
        
        this.hideLeaveConfirmation();
    // Clear game state locally
    this.gameId = null;
    this.myPlayerNumber = null;
    this.myPlayerName = null;
    this.inRoom = false;
    this.gameActive = false;
    document.getElementById('room-info').textContent = '';
    this.disableChatInput();
    // Reset board UI & player labels
    this.resetBoard();
    document.getElementById('player1-name').textContent = 'Player 1 (Red)';
    document.getElementById('player2-name').textContent = 'Player 2 (Yellow)';
    this.currentPlayer = 1;
    this.updatePlayerIndicators();
    this.updateControlButtons();
    this.updateStatus('Left the game. Click "New Game" or "Join Game" to start playing.');
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Connect4Game();
});
