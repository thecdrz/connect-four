const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state management
const games = new Map();

class Connect4Game {
    constructor(gameId) {
        this.gameId = gameId;
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.players = [];
        this.currentPlayer = 1;
        this.gameActive = false;
    }

    addPlayer(socket) {
        if (this.players.length < 2) {
            const playerNumber = this.players.length + 1;
            this.players.push({ socket, playerNumber });
            
            socket.emit('gameJoined', { 
                gameId: this.gameId, 
                playerNumber 
            });

            // Start game when both players are connected
            if (this.players.length === 2) {
                this.startGame();
            }

            return playerNumber;
        }
        return null;
    }

    startGame() {
        this.gameActive = true;
        this.currentPlayer = 1;
        
        this.players.forEach(player => {
            player.socket.emit('gameStart', { 
                gameId: this.gameId,
                playerNumber: player.playerNumber 
            });
        });
    }

    makeMove(col, playerNumber) {
        if (!this.gameActive || this.currentPlayer !== playerNumber) {
            return false;
        }

        // Find the bottom empty row in the column
        const row = this.getBottomEmptyRow(col);
        if (row === -1) {
            return false;
        }

        // Update board
        this.board[row][col] = playerNumber;
        
        // Notify all players about the move
        this.broadcast('moveMade', { 
            col, 
            player: playerNumber, 
            row 
        });

        // Check for win
        if (this.checkWin(row, col, playerNumber)) {
            this.gameActive = false;
            const winningCells = this.getWinningCells(row, col, playerNumber);
            this.broadcast('gameWon', { 
                winner: playerNumber, 
                winningCells 
            });
            return true;
        }

        // Check for draw
        if (this.isBoardFull()) {
            this.gameActive = false;
            this.broadcast('gameDraw');
            return true;
        }

        // Switch turns
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
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

    removePlayer(socket) {
        const playerIndex = this.players.findIndex(player => player.socket === socket);
        if (playerIndex !== -1) {
            this.players.splice(playerIndex, 1);
            
            // Notify remaining players
            if (this.players.length > 0) {
                this.broadcast('playerDisconnected');
            }
            
            this.gameActive = false;
        }
    }

    broadcast(event, data = {}) {
        this.players.forEach(player => {
            player.socket.emit(event, data);
        });
    }
}

// Generate random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create new game
    socket.on('createGame', () => {
        const gameId = generateGameId();
        const game = new Connect4Game(gameId);
        games.set(gameId, game);
        
        const playerNumber = game.addPlayer(socket);
        socket.gameId = gameId;
        socket.playerNumber = playerNumber;
        
        socket.emit('gameCreated', { gameId, playerNumber });
        console.log(`Game created: ${gameId}`);
    });

    // Join existing game
    socket.on('joinGame', ({ gameId }) => {
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        if (game.players.length >= 2) {
            socket.emit('error', { message: 'Game is full' });
            return;
        }
        
        const playerNumber = game.addPlayer(socket);
        if (playerNumber) {
            socket.gameId = gameId;
            socket.playerNumber = playerNumber;
            console.log(`Player ${playerNumber} joined game: ${gameId}`);
        }
    });

    // Handle move
    socket.on('makeMove', ({ gameId, col, player }) => {
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        if (player !== socket.playerNumber) {
            socket.emit('error', { message: 'Invalid player' });
            return;
        }
        
        const success = game.makeMove(col, player);
        if (!success) {
            socket.emit('error', { message: 'Invalid move' });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        if (socket.gameId) {
            const game = games.get(socket.gameId);
            if (game) {
                game.removePlayer(socket);
                
                // Remove empty games
                if (game.players.length === 0) {
                    games.delete(socket.gameId);
                    console.log(`Game removed: ${socket.gameId}`);
                }
            }
        }
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`Connect 4 server running on port ${PORT}`);
    console.log(`Open your browser and go to: http://localhost:${PORT}`);
});

// Clean up empty games periodically
setInterval(() => {
    for (const [gameId, game] of games.entries()) {
        if (game.players.length === 0) {
            games.delete(gameId);
            console.log(`Cleaned up empty game: ${gameId}`);
        }
    }
}, 60000); // Clean up every minute
