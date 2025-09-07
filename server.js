const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;

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

// Player stats storage
let playerStats = {};
const STATS_FILE = path.join(__dirname, 'player-stats.json');

// Load player stats from file
async function loadPlayerStats() {
    try {
        const data = await fs.readFile(STATS_FILE, 'utf8');
        playerStats = JSON.parse(data);
    } catch (error) {
        // File doesn't exist or is invalid, start with empty stats
        playerStats = {};
    }
}

// Save player stats to file
async function savePlayerStats() {
    try {
        await fs.writeFile(STATS_FILE, JSON.stringify(playerStats, null, 2));
    } catch (error) {
        console.error('Error saving player stats:', error);
    }
}

// Update player stats
function updatePlayerStats(playerName, won) {
    if (!playerStats[playerName]) {
        playerStats[playerName] = { wins: 0, losses: 0, games: 0 };
    }
    
    playerStats[playerName].games++;
    if (won) {
        playerStats[playerName].wins++;
    } else {
        playerStats[playerName].losses++;
    }
    
    savePlayerStats();
}

// Get top 10 leaderboard
function getLeaderboard() {
    const players = Object.entries(playerStats)
        .map(([name, stats]) => ({
            name,
            wins: stats.wins,
            losses: stats.losses,
            games: stats.games,
            winRate: stats.games > 0 ? (stats.wins / stats.games * 100).toFixed(1) : 0
        }))
        .sort((a, b) => {
            // Sort by wins first, then by win rate
            if (b.wins !== a.wins) return b.wins - a.wins;
            return parseFloat(b.winRate) - parseFloat(a.winRate);
        })
        .slice(0, 10);
    
    return players;
}

// Initialize stats on startup
loadPlayerStats();

class Connect4Game {
    constructor(gameId) {
        this.gameId = gameId;
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.players = [];
        this.currentPlayer = 1;
        this.gameActive = false;
        this.chatMessages = [];
    }

    addPlayer(socket, playerName) {
        if (this.players.length < 2) {
            const playerNumber = this.players.length + 1;
            this.players.push({ socket, playerNumber, name: playerName });
            
            socket.emit('gameJoined', { 
                gameId: this.gameId, 
                playerNumber,
                playerName
            });

            // Send updated player list to all players
            this.broadcast('playersUpdated', {
                players: this.players.map(p => ({ number: p.playerNumber, name: p.name }))
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
            const winnerName = this.players.find(p => p.playerNumber === playerNumber)?.name;
            const loserName = this.players.find(p => p.playerNumber !== playerNumber)?.name;
            
            // Update player stats
            if (winnerName) updatePlayerStats(winnerName, true);
            if (loserName) updatePlayerStats(loserName, false);
            
            this.broadcast('gameWon', { 
                winner: playerNumber, 
                winnerName,
                winningCells 
            });
            return true;
        }

        // Check for draw
        if (this.isBoardFull()) {
            this.gameActive = false;
            
            // Update stats for both players (no winner in draw)
            this.players.forEach(player => {
                if (player.name) updatePlayerStats(player.name, false);
            });
            
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

    addChatMessage(playerNumber, message) {
        const player = this.players.find(p => p.playerNumber === playerNumber);
        if (!player) return false;
        
        const chatMessage = {
            playerNumber,
            playerName: player.name,
            message: message.trim(),
            timestamp: new Date().toISOString()
        };
        
        this.chatMessages.push(chatMessage);
        
        // Keep only last 50 messages
        if (this.chatMessages.length > 50) {
            this.chatMessages = this.chatMessages.slice(-50);
        }
        
        this.broadcast('chatMessage', chatMessage);
        return true;
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
    socket.on('createGame', ({ playerName }) => {
        if (!playerName || playerName.trim().length < 2) {
            socket.emit('error', { message: 'Player name must be at least 2 characters' });
            return;
        }
        
        if (playerName.trim().length > 15) {
            socket.emit('error', { message: 'Player name must be 15 characters or less' });
            return;
        }
        
        const gameId = generateGameId();
        const game = new Connect4Game(gameId);
        games.set(gameId, game);
        
        const playerNumber = game.addPlayer(socket, playerName.trim());
        socket.gameId = gameId;
        socket.playerNumber = playerNumber;
        socket.playerName = playerName.trim();
        
        // Only emit gameCreated with the gameId, addPlayer already handles the rest
        socket.emit('gameCreated', { gameId });
        console.log(`Game created: ${gameId} by ${playerName}`);
    });

    // Join existing game
    socket.on('joinGame', ({ gameId, playerName }) => {
        if (!playerName || playerName.trim().length < 2) {
            socket.emit('error', { message: 'Player name must be at least 2 characters' });
            return;
        }
        
        if (playerName.trim().length > 15) {
            socket.emit('error', { message: 'Player name must be 15 characters or less' });
            return;
        }
        
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        if (game.players.length >= 2) {
            socket.emit('error', { message: 'Game is full' });
            return;
        }
        
        const playerNumber = game.addPlayer(socket, playerName.trim());
        if (playerNumber) {
            socket.gameId = gameId;
            socket.playerNumber = playerNumber;
            socket.playerName = playerName.trim();
            console.log(`Player ${playerNumber} (${playerName}) joined game: ${gameId}`);
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

    // Handle chat messages
    socket.on('sendChatMessage', ({ gameId, message }) => {
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        if (!message || message.trim().length === 0) {
            return;
        }
        
        if (message.trim().length > 200) {
            socket.emit('error', { message: 'Message too long (max 200 characters)' });
            return;
        }
        
        game.addChatMessage(socket.playerNumber, message.trim());
    });

    // Get leaderboard
    socket.on('getLeaderboard', () => {
        socket.emit('leaderboard', getLeaderboard());
    });

    // Handle leaving a game
    socket.on('leaveGame', () => {
        if (socket.gameId) {
            const game = games.get(socket.gameId);
            if (game) {
                game.removePlayer(socket);
                
                // Confirm to the leaving player
                socket.emit('gameLeft');

                // Clean up if game is now empty
                if (game.players.length === 0) {
                    games.delete(socket.gameId);
                    console.log(`Game removed after player left: ${socket.gameId}`);
                }
            }
            // Clear game association from socket
            socket.gameId = null;
            socket.playerNumber = null;
            socket.playerName = null;
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id} (${socket.playerName || 'Unknown'})`);
        
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
