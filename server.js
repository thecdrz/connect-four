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
// Map<gameId, Connect4Game>
const games = new Map();

// Helper to build lobby game summaries
function getLobbyGames() {
    const list = [];
    for (const [id, game] of games.entries()) {
        const host = game.players[0]?.name || null;
        const opponent = game.players[1]?.name || null;
        let status = 'waiting';
        if (game.players.length === 2 && game.gameActive) status = 'playing';
        else if (!game.gameActive && game.players.length > 0 && (game._finished || game._winner)) status = 'finished';
        list.push({
            gameId: id,
            host,
            opponent,
            status,
            players: game.players.length,
            spectators: game.spectators ? game.spectators.size : 0,
            createdAt: game.createdAt
        });
    }
    // Show waiting games first, then playing, then finished; newest first within groups
    return list.sort((a,b)=>{
        const order = {waiting:0, playing:1, finished:2};
        if (order[a.status] !== order[b.status]) return order[a.status]-order[b.status];
        return b.createdAt - a.createdAt;
    });
}

function emitLobbyUpdate(ioInstance) {
    ioInstance.to('lobby').emit('lobby:update', getLobbyGames());
}

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
    this.rematchVotes = new Set();
    this.spectators = new Set(); // sockets watching the game
    this.createdAt = Date.now();
    this._finished = false;
    this._winner = null;
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
            
            this._finished = true;
            this._winner = playerNumber;
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
            
            this._finished = true;
            this.broadcast('gameDraw');
            return true;
        }

        // Switch turns
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        return true;
    }

    switchTurn() {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        console.log(`Turn switched to player ${this.currentPlayer}`);
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
    this.players.forEach(player => player.socket.emit(event, data));
    // Also broadcast to spectators
    this.spectators.forEach(sock => sock.emit(event, data));
    }

    broadcastToOthers(excludeSocket, event, data = {}) {
        this.players.forEach(player => {
            if (player.socket !== excludeSocket) {
                player.socket.emit(event, data);
            }
        });
        // Also broadcast to spectators
        this.spectators.forEach(sock => sock.emit(event, data));
    }

    resetForRematch() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1;
        this.gameActive = true;
        this.rematchVotes.clear();
        this._finished = false;
        this._winner = null;
        this.broadcast('rematchStarted', {});
        // Send fresh gameStart payload (reuse for simplicity)
        this.players.forEach(p => p.socket.emit('gameStart', { gameId: this.gameId, playerNumber: p.playerNumber }));
    }

    addSpectator(socket) {
        this.spectators.add(socket);
    }

    removeSpectator(socket) {
        if (this.spectators.has(socket)) this.spectators.delete(socket);
    }

    getState() {
        return {
            gameId: this.gameId,
            board: this.board,
            currentPlayer: this.currentPlayer,
            gameActive: this.gameActive,
            players: this.players.map(p=>({ number:p.playerNumber, name:p.name })),
            chat: this.chatMessages.slice(-30)
        };
    }
}

// Generate random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Lobby subscription
    socket.on('lobby:subscribe', () => {
        socket.join('lobby');
        socket.emit('lobby:update', getLobbyGames());
    });

    socket.on('lobby:unsubscribe', () => {
        socket.leave('lobby');
    });

    // Create new game
    socket.on('createGame', ({ playerName }) => {
        if (socket.gameId) {
            socket.emit('error', { message: 'Already in a game. Leave first.' });
            return;
        }
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
    emitLobbyUpdate(io); // new game added
    });

    // Join existing game
    socket.on('joinGame', ({ gameId, playerName }) => {
        if (socket.gameId) {
            socket.emit('error', { message: 'Already in a game. Leave first.' });
            return;
        }
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
            emitLobbyUpdate(io); // status may have changed (waiting->playing)
        }
    });

    // Spectate existing game
    socket.on('spectateGame', ({ gameId }) => {
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        if (socket.gameId) {
            socket.emit('error', { message: 'Already in a game' });
            return;
        }
        game.addSpectator(socket);
        socket.spectatingGameId = gameId;
        socket.emit('spectatorJoined', game.getState());
    });

    socket.on('stopSpectating', () => {
        if (socket.spectatingGameId) {
            const g = games.get(socket.spectatingGameId);
            if (g) g.removeSpectator(socket);
            socket.spectatingGameId = null;
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

    // Handle checkers moves
    socket.on('checkersMove', ({ gameId, from, to, piece, captured, king }) => {
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Verify it's the player's turn
        if (socket.playerNumber !== game.currentPlayer) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }
        
        // Broadcast the move to OTHER players in the game (not the sender)
        game.broadcastToOthers(socket, 'checkersMoveMade', {
            from: from,
            to: to,
            piece: piece,
            captured: captured,
            king: king,
            player: socket.playerNumber
        });
        
        // Switch turns first
        game.switchTurn();
        
        // Send confirmation back to the sender with turn info
        socket.emit('moveConfirmed', {
            nextPlayer: game.currentPlayer // Send the current player after switch
        });
        
        // Broadcast turn update to everyone (including sender for consistency)
        game.broadcast('turnUpdate', {
            currentPlayer: game.currentPlayer,
            playerColor: game.currentPlayer === 1 ? 'red' : 'black'
        });
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

    // Typing indicator
    socket.on('typing', ({ gameId, isTyping }) => {
        const game = games.get(gameId);
        if (!game) return;
        // Notify opponent only
        game.players.forEach(p => {
            if (p.socket !== socket) {
                p.socket.emit('typing', { playerNumber: socket.playerNumber, isTyping: !!isTyping, playerName: socket.playerName });
            }
        });
    });

    // Rematch handling
    socket.on('requestRematch', ({ gameId }) => {
        const game = games.get(gameId);
        if (!game) return;
        if (game.gameActive) return; // Only after a game ended
        game.rematchVotes.add(socket.playerNumber);
        const votes = Array.from(game.rematchVotes);
        game.broadcast('rematchVote', { votes, needed: game.players.length });
        if (game.players.length === 2 && game.rematchVotes.size === game.players.length) {
            game.resetForRematch();
                emitLobbyUpdate(io); // game back to active playing
        }
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
                    emitLobbyUpdate(io);
                } else {
                    emitLobbyUpdate(io);
                }
            }
            // Clear game association from socket
            socket.gameId = null;
            socket.playerNumber = null;
            socket.playerName = null;
        }
        if (socket.spectatingGameId) {
            const g = games.get(socket.spectatingGameId);
            if (g) g.removeSpectator(socket);
            socket.spectatingGameId = null;
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
                    emitLobbyUpdate(io);
                } else {
                    emitLobbyUpdate(io);
                }
            }
        }
        if (socket.spectatingGameId) {
            const g = games.get(socket.spectatingGameId);
            if (g) g.removeSpectator(socket);
        }
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Simple lobby API (optional polling fallback)
app.get('/api/games', (req, res) => {
    res.json({ games: getLobbyGames() });
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
