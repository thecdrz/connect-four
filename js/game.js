class Connect4Game {
    constructor() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1;
        this.gameActive = false;
        this.isMyTurn = false;
        this.myPlayerNumber = null;
        this.socket = null;
        this.gameId = null;
        
        this.initializeGame();
        this.initializeSocket();
        this.setupEventListeners();
    }

    initializeGame() {
        this.createBoard();
        this.updateStatus('Connecting to server...');
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected', 'Connected');
            this.updateStatus('Connected! Click "New Game" to start or "Join Game" to join an existing game.');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.updateStatus('Disconnected from server');
            this.gameActive = false;
        });

        this.socket.on('gameCreated', (data) => {
            this.gameId = data.gameId;
            this.myPlayerNumber = 1;
            this.updateStatus(`Game created! Room ID: ${this.gameId}. Waiting for another player...`);
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
        });

        this.socket.on('gameJoined', (data) => {
            this.gameId = data.gameId;
            this.myPlayerNumber = data.playerNumber;
            this.updateStatus('Joined game! Starting...');
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
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
            this.showModal(
                isWinner ? 'You Won!' : 'You Lost!',
                isWinner ? 'Congratulations! You won the game!' : 'Better luck next time!'
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

        this.socket.on('error', (error) => {
            this.updateStatus(`Error: ${error.message}`);
        });
    }

    setupEventListeners() {
        document.getElementById('new-game').addEventListener('click', () => {
            if (this.socket) {
                this.socket.emit('createGame');
            }
        });

        document.getElementById('join-game').addEventListener('click', () => {
            const roomId = prompt('Enter Room ID:');
            if (roomId && this.socket) {
                this.socket.emit('joinGame', { gameId: roomId });
            }
        });

        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideModal();
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
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Connect4Game();
});
