class Connect4Game {
    constructor() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1;
        this.gameActive = false;
        this.isMyTurn = false;
        this.myPlayerNumber = null;
        this.myPlayerName = null;
        this.opponentName = null;
        this.socket = null;
        this.gameId = null;
        this.pendingAction = null; // 'create' or 'join'
        
        this.initializeGame();
        this.initializeSocket();
        this.setupEventListeners();
    }

    initializeGame() {
        this.createBoard();
        this.updateStatus('Connecting to server...');
        this.disableChatInput();
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected', 'Connected');
            this.updateStatus('Connected! Click "New Game" or "Join Game" to start playing.');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.updateStatus('Disconnected from server');
            this.gameActive = false;
        });

        this.socket.on('gameCreated', (data) => {
            this.gameId = data.gameId;
            this.myPlayerNumber = 1;
            this.myPlayerName = data.playerName;
            this.updateStatus(`Game created! Room ID: ${this.gameId}. Waiting for another player...`);
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
            this.hideNameModal();
            this.enableChatInput();
        });

        this.socket.on('gameJoined', (data) => {
            this.gameId = data.gameId;
            this.myPlayerNumber = data.playerNumber;
            this.myPlayerName = data.playerName;
            this.updateStatus('Joined game! Starting...');
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
            this.hideNameModal();
            this.enableChatInput();
        });

        this.socket.on('gameStart', (data) => {
            this.gameActive = true;
            this.currentPlayer = 1;
            this.isMyTurn = this.myPlayerNumber === 1;
            this.resetBoard();
            this.updatePlayerIndicators();
            this.updateStatus(this.isMyTurn ? 'Your turn!' : "Opponent's turn");
        });

        this.socket.on('moveMade', (data) => {
            this.makeMove(data.col, data.player, false);
        });

        this.socket.on('gameWon', (data) => {
            this.gameActive = false;
            const isWinner = data.winner === this.myPlayerNumber;
            this.highlightWinningCells(data.winningCells);
            const winnerName = data.winnerName || `Player ${data.winner}`;
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
        });

        this.socket.on('playersUpdated', (data) => {
            this.updatePlayerNames(data.players);
        });

        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data);
        });

        this.socket.on('leaderboard', (data) => {
            this.showLeaderboard(data);
        });

        this.socket.on('error', (error) => {
            this.updateStatus(`Error: ${error.message}`);
        });
    }

    setupEventListeners() {
        // Name modal listeners
        document.getElementById('start-new-game').addEventListener('click', () => {
            this.pendingAction = 'create';
            this.tryStartGame();
        });

        document.getElementById('start-join-game').addEventListener('click', () => {
            this.pendingAction = 'join';
            document.getElementById('join-room-input').classList.remove('hidden');
        });

        document.getElementById('confirm-join').addEventListener('click', () => {
            this.tryStartGame();
        });

        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (this.pendingAction === 'create') {
                    this.tryStartGame();
                } else if (this.pendingAction === 'join') {
                    document.getElementById('join-room-input').classList.remove('hidden');
                }
            }
        });

        document.getElementById('room-id-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.tryStartGame();
            }
        });

        // New simplified game button listeners
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.pendingAction = 'create';
            this.showNameModal();
        });

        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.pendingAction = 'join';
            this.showNameModal();
            setTimeout(() => {
                document.getElementById('join-room-input').classList.remove('hidden');
            }, 100);
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
        
        // Update UI
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add(player === 1 ? 'red' : 'yellow');
        
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
        document.getElementById('name-modal').classList.remove('hidden');
        document.getElementById('join-room-input').classList.add('hidden');
        document.getElementById('player-name').focus();
    }

    hideNameModal() {
        document.getElementById('name-modal').classList.add('hidden');
        // Clear the form
        document.getElementById('player-name').value = '';
        document.getElementById('room-id-input').value = '';
        document.getElementById('join-room-input').classList.add('hidden');
        this.pendingAction = null;
    }

    tryStartGame() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName || playerName.length < 2) {
            alert('Please enter a name with at least 2 characters');
            return;
        }

        if (!this.socket) {
            alert('Not connected to server');
            return;
        }

        if (this.pendingAction === 'create') {
            this.socket.emit('createGame', { playerName });
        } else if (this.pendingAction === 'join') {
            const roomId = document.getElementById('room-id-input').value.trim().toUpperCase();
            if (!roomId || roomId.length !== 6) {
                alert('Please enter a valid 6-character room ID');
                return;
            }
            this.socket.emit('joinGame', { gameId: roomId, playerName });
        }
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
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Connect4Game();
});
