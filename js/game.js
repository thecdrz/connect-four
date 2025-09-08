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
        this.gameMode = null; // 'cpu' or 'online'
        this.gameType = 'connect4'; // 'connect4' or 'checkers'
        this.selectedPiece = null; // For checkers piece selection
        this.cpuDifficulty = 'easy'; // 'easy', 'medium', 'hard'
        this.currentCpuCharacter = null; // Will store selected CPU character info
        this.pendingAction = null; // 'create' or 'join'
        this.audioEnabled = true;
        this.sounds = {};
    // Lobby & Spectator
    this.lobbyGames = [];
    this.isSpectator = false;
    this.spectatingGameId = null;
    this.playerNameMap = {};
    this.inviteBaseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/i,'');
    this.typingTimeout = null;
    this.iAmTyping = false;
    // Join flow tracking
    this.joinAttempted = 0;
    this.joinErrorEncountered = false;
        
        this.initializeAudio();
        
        this.initializeGame();
        this.initializeSocket();
        this.setupEventListeners();
    this.processInviteParams();

    // Ensure chat window never extends below board on desktop
    window.addEventListener('resize', () => this.adjustChatHeight());
    // Defer initial calculation until layout settles
    setTimeout(()=> this.adjustChatHeight(), 10);
    // Initialize scroll shadows shortly after layout
    setTimeout(()=> this.initScrollShadows && this.initScrollShadows(), 30);
    }

    initializeGame() {
        this.createBoard();
        this.createCheckersBoard();
        this.updateStatus('🔴 Connect 4 selected! Choose a game mode to start.');
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
            checkersMove: this.createBeepSound(450, 0.08), // Checkers piece move
            checkersCapture: this.createBeepSound(650, 0.15), // Checkers capture
            checkersSelect: this.createBeepSound(350, 0.04), // Checkers piece selection
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
            this.updateStatus('🌐 Connected! Select a game type and mode to start.');
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
            this.isSpectator = false;
            this.spectatingGameId = null;
            this.updateControlButtons();
        });

        this.socket.on('gameCreated', (data) => {
            this.gameId = data.gameId;
            this.inRoom = true;
            this.updateStatus('Game created! Waiting for another player to join...');
            document.getElementById('room-info').textContent = `Room: ${this.gameId}`;
            this.hideNameModal();
            this.enableChatInput();
            this.updateControlButtons();
            this.showInviteActions();
            // Recalculate chat height now that invite actions expanded status panel
            setTimeout(()=>this.adjustChatHeight(), 30);
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
            this.showInviteActions();
            setTimeout(()=>this.adjustChatHeight(), 30);
        });

        this.socket.on('gameStart', (data) => {
            this.gameMode = 'online'; // Set game mode for online multiplayer
            this.gameActive = true;
            this.currentPlayer = 1;
            this.myPlayerNumber = data.playerNumber;
            this.isMyTurn = this.myPlayerNumber === 1;
            this.resetBoard();
            this.updatePlayerIndicators();
            this.updateStatus(this.isMyTurn ? 'Your turn!' : "Opponent's turn");
            this.updateControlButtons();
            // Board or status changes may alter heights
            setTimeout(()=>this.adjustChatHeight(), 30);
        });

        // Lobby updates
        this.socket.on('lobby:update', (games) => {
            this.lobbyGames = games;
            this.renderLobby();
        });

        // Spectator join
        this.socket.on('spectatorJoined', (state) => {
            this.isSpectator = true;
            this.spectatingGameId = state.gameId;
            this.gameId = state.gameId; // reuse for board updates
            this.gameMode = 'online';
            this.gameActive = state.gameActive;
            this.board = state.board;
            this.currentPlayer = state.currentPlayer;
            this.resetBoard();
            // Repaint board from state
            for (let r=0;r<6;r++) {
                for (let c=0;c<7;c++) {
                    const v = state.board[r][c];
                    if (v !== 0) {
                        const cell = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                        if (cell) cell.classList.add(v===1?'red':'yellow');
                    }
                }
            }
            // Names
            const p1Name = state.players[0]?.name || 'Player 1';
            const p2Name = state.players[1]?.name || 'Player 2';
            document.getElementById('player1-name').textContent = p1Name;
            document.getElementById('player2-name').textContent = p2Name;
            this.playerNameMap[1] = p1Name;
            this.playerNameMap[2] = p2Name;
            this.updatePlayerIndicators();
            this.updateTurnStatus();
            this.disableChatInput(); // read-only for now
            // Load recent chat messages in read-only view
            state.chat.forEach(msg => this.addChatMessage(msg));
            this.updateControlButtons();
            const stopBtn = document.getElementById('stop-spectating-btn');
            if (stopBtn) stopBtn.classList.remove('hidden');
            // Ensure consistent sidebar sizing for spectators
            setTimeout(()=>this.adjustChatHeight(), 30);
        });

        this.socket.on('spectateEnded', () => {
            if (this.isSpectator) this.stopSpectating();
        });

        this.socket.on('moveMade', (data) => {
            this.makeMove(data.col, data.player, true);
        });

        this.socket.on('checkersMoveMade', (data) => {
            // Apply the move from another player
            console.log('🌐 Received checkers move from other player:', data);
            this.applyCheckersMove(data.from, data.to, data.piece, data.captured, data.king, data.player);
        });

        this.socket.on('moveConfirmed', (data) => {
            // Update turn after our move was confirmed by server
            console.log('🌐 Move confirmed by server, new current player:', data.nextPlayer);
            this.currentPlayer = data.nextPlayer;
            this.isMyTurn = this.currentPlayer === this.myPlayerNumber;
            const playerColor = this.currentPlayer === 1 ? 'red' : 'black';
            document.getElementById('status').textContent = `${playerColor}'s turn`;
        });

        this.socket.on('turnUpdate', (data) => {
            // Update turn state from server authority
            console.log('🌐 Turn update from server:', data.currentPlayer, data.playerColor);
            this.currentPlayer = data.currentPlayer;
            this.isMyTurn = this.currentPlayer === this.myPlayerNumber;
            document.getElementById('status').textContent = `${data.playerColor}'s turn`;
            console.log(`🌐 Updated: currentPlayer=${this.currentPlayer}, myPlayerNumber=${this.myPlayerNumber}, isMyTurn=${this.isMyTurn}`);
        });

        this.socket.on('gameWon', (data) => {
            this.gameActive = false;
            this.highlightWinningCells(data.winningCells);
            const winnerName = data.winnerName || `Player ${data.winner}`;
            const spectatorView = this.isSpectator && !this.inRoom;
            if (spectatorView) {
                this.showModal('Game Over', `${winnerName} won the game.`);
            } else {
                const isWinner = data.winner === this.myPlayerNumber;
                this.sounds.win.play();
                this.showModal(
                    isWinner ? '🎉 You Won!' : '😔 You Lost!',
                    isWinner ?
                        `Congratulations ${winnerName}! You won the game!` :
                        `${winnerName} won this game. Better luck next time!`
                );
            }
        });

        this.socket.on('gameDraw', () => {
            this.gameActive = false;
            if (this.isSpectator && !this.inRoom) {
                this.showModal('Game Draw!', 'This game ended in a draw.');
            } else {
                this.showModal('Game Draw!', "It's a tie! Good game!");
            }
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

        this.socket.on('typing', (data) => {
            this.updateTypingIndicator(data);
        });

        this.socket.on('rematchVote', ({ votes, needed }) => {
            const btn = document.getElementById('rematch-btn');
            if (btn) {
                btn.textContent = votes.includes(this.myPlayerNumber) ? `⏳ Waiting (${votes.length}/${needed})` : `🔄 Rematch (${votes.length}/${needed})`;
                btn.disabled = votes.includes(this.myPlayerNumber);
            }
        });

        this.socket.on('rematchStarted', () => {
            const btn = document.getElementById('rematch-btn');
            if (btn) {
                btn.classList.add('hidden');
                btn.disabled = false;
                btn.textContent = '🔄 Rematch';
            }
            this.hideModal();
        });

        this.socket.on('leaderboard', (data) => {
            this.showLeaderboard(data);
        });

        this.socket.on('gameLeft', () => {
            this.hideLeaveConfirmation();
            this.resetToLobbyState('You have left the game.');
        });

        this.socket.on('error', (error) => {
            this.updateStatus(`Error: ${error.message}`);
            const roomStep = document.getElementById('room-code-step');
            if (roomStep && !roomStep.classList.contains('hidden') && this.pendingAction === 'join') {
                this.joinErrorEncountered = true;
            }
        });
    }

    setupEventListeners() {
        // Game type selection
        document.getElementById('connect4-game-type').addEventListener('click', () => {
            this.sounds.click.play();
            this.switchGameType('connect4');
        });

        document.getElementById('checkers-game-type').addEventListener('click', () => {
            this.sounds.click.play();
            this.switchGameType('checkers');
        });

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
            if (this.joinErrorEncountered || this.joinAttempted > 0) {
                this.hideNameModal();
            } else {
                this.showNameStep(this.pendingAction);
            }
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
            // Check the current button text to determine what action to take
            const buttonText = document.getElementById('new-game-btn').textContent;
            
            if (buttonText.includes('New CPU Game')) {
                // In CPU mode, start a new CPU game with current difficulty
                this.showCPUDifficultyModal();
            } else {
                // Default: start an online game
                this.showNameModal();
                this.showNameStep('create');
            }
        });

        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.sounds.click.play();
            if (this.inRoom && this.gameMode === 'online') {
                // Already in an online game; ignore
                return;
            }
            if (this.gameMode === 'cpu') {
                // In CPU mode, this button becomes "Back to Menu"
                this.resetToLobbyState('Welcome back! Choose a game mode to start playing.');
            } else {
                // Normal mode: show name modal for joining game
                this.showNameModal();
                this.showNameStep('join');
            }
        });

        document.getElementById('cpu-game-btn').addEventListener('click', () => {
            this.sounds.click.play();
            this.showCPUDifficultyModal();
        });

        // CPU difficulty selection listeners
        document.getElementById('cpu-modal-close').addEventListener('click', () => {
            this.hideCPUDifficultyModal();
        });

        document.getElementById('cancel-cpu-selection').addEventListener('click', () => {
            this.sounds.click.play();
            this.hideCPUDifficultyModal();
        });

        // Difficulty button listeners
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.sounds.click.play();
                const difficulty = btn.getAttribute('data-difficulty');
                this.startCPUGame(difficulty);
                this.hideCPUDifficultyModal();
            });
        });

        // Leaderboard button
        document.getElementById('show-leaderboard').addEventListener('click', () => {
            if (this.socket) {
                this.socket.emit('getLeaderboard');
            }
        });

        // Lobby toggle (repurpose join button long press maybe future). For MVP add a simple clickable area.
        const roomInfo = document.getElementById('room-info');
        if (roomInfo) {
            roomInfo.addEventListener('dblclick', ()=>{
                // Quick refresh lobby list popup
                this.requestLobby();
            });
        }

        // Delegate clicks for lobby actions (Join / Spectate)
        document.addEventListener('click', (e)=>{
            const joinBtn = e.target.closest('[data-join-game-id]');
            if (joinBtn) {
                const id = joinBtn.getAttribute('data-join-game-id');
                if (id) this.quickJoinGame(id);
            }
            const specBtn = e.target.closest('[data-spectate-game-id]');
            if (specBtn) {
                const id = specBtn.getAttribute('data-spectate-game-id');
                if (id) this.spectateGame(id);
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

    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('input', () => this.handleTyping());
    chatInput.addEventListener('blur', () => this.sendTyping(false));

        // Modal close listeners
        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideModal();
        });

        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            rematchBtn.addEventListener('click', () => {
                if (this.socket && this.gameId) {
                    this.socket.emit('requestRematch', { gameId: this.gameId });
                    rematchBtn.disabled = true;
                    rematchBtn.textContent = '⏳ Waiting';
                }
            });
        }

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

        // Stop spectating button
        const stopSpectateBtn = document.getElementById('stop-spectating-btn');
        if (stopSpectateBtn) {
            stopSpectateBtn.addEventListener('click', () => {
                if (this.isSpectator) {
                    this.sounds.click.play();
                    this.stopSpectating();
                }
            });
        }

        // Leave game confirmation
        document.getElementById('confirm-leave').addEventListener('click', () => {
            this.sounds.click.play();
            this.leaveGame();
        });

        document.getElementById('cancel-leave').addEventListener('click', () => {
            this.sounds.click.play();
            this.hideLeaveConfirmation();
        });

        // Invite feature buttons
    const copyLinkBtn = document.getElementById('copy-invite-link');
    const copyCodeBtn = document.getElementById('copy-room-code');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                if (!this.gameId) return;
                const url = this.buildInviteUrl();
                navigator.clipboard.writeText(url).then(() => this.showInviteFeedback('Link copied!', true)).catch(()=>this.showInviteFeedback('Copy failed', false));
            });
        }
        if (copyCodeBtn) {
            copyCodeBtn.addEventListener('click', () => {
                if (!this.gameId) return;
                navigator.clipboard.writeText(this.gameId).then(()=>this.showInviteFeedback('Code copied!', true)).catch(()=>this.showInviteFeedback('Copy failed', false));
            });
        }
    }

    createBoard() {
        const boardElement = document.getElementById('connect4-board');
        boardElement.innerHTML = '';
    // Removed numeric column headers to reduce visual clutter

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

    createCheckersBoard() {
        console.log('🔨 Creating checkers board...');
        const boardElement = document.getElementById('checkers-board');
        console.log('📋 Board element:', boardElement);
        console.log('📋 Board current innerHTML length:', boardElement.innerHTML.length);
        boardElement.innerHTML = '';
        console.log('🧹 Board cleared, creating squares...');
        
        // Initialize checkers board - only dark squares are playable
        // Standard checkers setup: 8x8 board, pieces on dark squares of first 3 and last 3 rows
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                const isDark = (row + col) % 2 === 1;
                
                square.className = `checkers-square ${isDark ? 'dark playable' : 'light'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                
                // Place initial pieces on dark squares
                if (isDark) {
                    if (row < 3) {
                        // Black pieces (top) - CPU pieces
                        console.log(`🔴 Creating BLACK piece at (${row},${col})`);
                        const piece = document.createElement('div');
                        piece.className = 'checkers-piece black';
                        piece.dataset.color = 'black';
                        piece.dataset.king = 'false';
                        square.appendChild(piece);
                        console.log(`✅ BLACK piece added to square:`, square.innerHTML);
                    } else if (row > 4) {
                        // Red pieces (bottom) - Player pieces
                        console.log(`🔴 Creating RED piece at (${row},${col})`);
                        const piece = document.createElement('div');
                        piece.className = 'checkers-piece red';
                        piece.dataset.color = 'red';
                        piece.dataset.king = 'false';
                        square.appendChild(piece);
                        console.log(`✅ RED piece added to square:`, square.innerHTML);
                    }
                }
                
                // Add click listeners to ALL squares (not just dark ones)
                square.addEventListener('click', () => this.handleCheckersMove(row, col));
                
                boardElement.appendChild(square);
            }
        }
        
        // Test: check if pieces were actually added
        setTimeout(() => {
            console.log('🔍 TESTING: Board content after creation:');
            const redPieces = document.querySelectorAll('#checkers-board .checkers-piece.red');
            const blackPieces = document.querySelectorAll('#checkers-board .checkers-piece.black');
            console.log(`🔴 Found ${redPieces.length} red pieces`);
            console.log(`⚫ Found ${blackPieces.length} black pieces`);
            if (redPieces.length > 0) {
                console.log('✅ First red piece:', redPieces[0]);
                console.log('✅ First red piece parent:', redPieces[0].parentElement);
            }
        }, 100);
    }

    switchGameType(gameType) {
        if (this.gameActive) {
            // Don't allow switching during active games
            return;
        }

        this.gameType = gameType;
        
        // Update button states
        document.querySelectorAll('.game-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`${gameType}-game-type`).classList.add('active');
        
        // Show/hide appropriate boards
        if (gameType === 'connect4') {
            document.getElementById('connect4-board').classList.remove('hidden');
            document.getElementById('checkers-board').classList.add('hidden');
        } else {
            document.getElementById('connect4-board').classList.add('hidden');
            document.getElementById('checkers-board').classList.remove('hidden');
        }
        
        // Update logo based on game type
        const gameLogo = document.getElementById('game-logo');
        const fallbackTitle = document.querySelector('.fallback-title');
        const gameInstructions = document.getElementById('game-instructions');
        
        if (gameType === 'connect4') {
            gameLogo.src = 'assets/Logo3.png';
            gameLogo.alt = 'Connect 4 Logo';
            fallbackTitle.textContent = 'Connect 4';
            gameInstructions.innerHTML = `
                <li>Click on a column to drop your piece</li>
                <li>Connect 4 pieces in a row to win</li>
                <li>Win horizontally, vertically, or diagonally</li>
                <li>Take turns with your opponent</li>
            `;
        } else {
            gameLogo.src = 'assets/Logo_Grace.png';
            gameLogo.alt = 'Checkers Logo';
            fallbackTitle.textContent = 'Checkers';
            gameInstructions.innerHTML = `
                <li><strong>Click a piece to select it</strong> (gets gold highlight)</li>
                <li><strong>Click an empty diagonal square to move</strong></li>
                <li>Jump over opponent pieces to capture them</li>
                <li>Reach the opposite end to become a King ♔</li>
                <li>Kings can move in any diagonal direction</li>
            `;
        }
        
        // Update status message
        if (gameType === 'connect4') {
            this.updateStatus('🔴 Connect 4 selected! Choose a game mode to start.');
        } else {
            this.updateStatus('🔴⚫ Checkers selected! Choose a game mode to start.');
        }
    }

    handleCheckersMove(row, col) {
        console.log(`🎯 handleCheckersMove called: row=${row}, col=${col}`);
        console.log(`🎮 Current game type: ${this.gameType}`);
        console.log(`👤 Current player: ${this.currentPlayer}`);
        console.log(`🎯 Selected piece:`, this.selectedPiece);
        
        if (this.gameType !== 'checkers') {
            console.log('❌ Not in checkers mode, exiting');
            return;
        }
        
        // Basic checkers move handler - target ONLY checkers board squares
        const square = document.querySelector(`#checkers-board [data-row="${row}"][data-col="${col}"]`);
        console.log('🔲 Selected square:', square);
        
        // If no piece is selected, select the piece
        if (!this.selectedPiece) {
            console.log('🔍 No piece selected, trying to select one...');
            console.log('🔲 Square innerHTML:', square.innerHTML);
            console.log('🔲 Square children:', square.children);
            const piece = square.querySelector('.checkers-piece');
            console.log('🔴 Found piece:', piece);
            
            let canSelect = false;
            if (piece) {
                console.log(`🎨 Piece color: ${piece.dataset.color}, Current player: ${this.currentPlayer}`);
                console.log(`🎮 Game mode: ${this.gameMode}, My player number: ${this.myPlayerNumber}, Is my turn: ${this.isMyTurn}`);
                
                // Determine if this piece can be selected based on game mode
                if (this.gameMode === 'online') {
                    // For online games: player 1 = red, player 2 = black, only move on your turn
                    const myColor = this.myPlayerNumber === 1 ? 'red' : 'black';
                    canSelect = piece.dataset.color === myColor && this.isMyTurn;
                    console.log(`🌐 Online game: My color: ${myColor}, My turn: ${this.isMyTurn}, Can select: ${canSelect}`);
                } else {
                    // For local/CPU games: HUMAN player can ONLY move RED pieces, never black
                    canSelect = piece.dataset.color === 'red' && this.currentPlayer === 'red';
                    console.log(`🏠 Local/CPU game: Piece is ${piece.dataset.color}, Current player: ${this.currentPlayer}, Can select: ${canSelect}`);
                }
                
                console.log(`✅ Can select: ${canSelect}`);
            }
            
            if (piece && canSelect) {
                this.selectedPiece = { row, col, piece };
                square.classList.add('selected');
                this.highlightPossibleMoves(row, col);
                this.sounds.checkersSelect.play(); // Play selection sound
                console.log(`✅ Selected ${piece.dataset.color} piece at ${row}, ${col}`);
            } else {
                console.log(`❌ Cannot select piece - either no piece found or wrong color/turn`);
                if (!piece) console.log('❌ No piece in this square');
                if (piece && !canSelect) {
                    if (this.gameMode === 'online') {
                        console.log(`❌ Online game: piece is ${piece.dataset.color}, you are ${this.myPlayerNumber === 1 ? 'red' : 'black'}, your turn: ${this.isMyTurn}`);
                    } else {
                        console.log(`❌ Local game: piece is ${piece.dataset.color}, current player is ${this.currentPlayer}`);
                    }
                }
            }
        } else {
            // If a piece is selected, try to move it
            const fromRow = this.selectedPiece.row;
            const fromCol = this.selectedPiece.col;
            
            // Clear previous selection and highlights - TARGET CHECKERS BOARD SPECIFICALLY
            const fromSquare = document.querySelector(`#checkers-board [data-row="${fromRow}"][data-col="${fromCol}"]`);
            fromSquare.classList.remove('selected');
            this.clearPossibleMoves();
            
            if (this.isValidCheckersMove(fromRow, fromCol, row, col)) {
                // Move the piece
                const piece = this.selectedPiece.piece;
                square.appendChild(piece);
                
                // Check for captures
                const capturedPiece = this.checkCapture(fromRow, fromCol, row, col);
                if (capturedPiece) {
                    capturedPiece.remove();
                    this.sounds.checkersCapture.play(); // Play capture sound
                    console.log(`Captured ${capturedPiece.dataset.color} piece!`);
                } else {
                    this.sounds.checkersMove.play(); // Play regular move sound
                }
                
                // Check for king promotion
                if ((piece.dataset.color === 'black' && row === 0) || 
                    (piece.dataset.color === 'red' && row === 7)) {
                    piece.dataset.king = 'true';
                    piece.classList.add('king');
                    console.log(`${piece.dataset.color} piece promoted to King!`);
                }
                
                // Check for additional captures (double jump)
                let hasMoreCaptures = false;
                if (capturedPiece) {
                    const additionalCaptures = this.getCheckersMovesForPiece(row, col).filter(move => move.isCapture);
                    if (additionalCaptures.length > 0) {
                        hasMoreCaptures = true;
                        console.log(`🎯 ${piece.dataset.color} piece can capture again! Highlighting additional moves.`);
                        this.selectedPiece = { row, col, piece };
                        square.classList.add('selected');
                        this.highlightPossibleMoves(row, col);
                        this.sounds.checkersSelect.play(); // Play selection sound for double jump
                        // Don't switch players yet - same player continues
                        return;
                    }
                }
                
                // For online games, send move to server
                if (this.gameMode === 'online' && this.socket) {
                    this.socket.emit('checkersMove', {
                        gameId: this.gameId, 
                        from: { row: fromRow, col: fromCol },
                        to: { row: row, col: col },
                        piece: piece.dataset.color,
                        captured: capturedPiece ? true : false,
                        king: piece.dataset.king === 'true'
                    });
                }
                
                // Switch players - handle both online (numeric) and local (string) player systems
                if (this.gameMode === 'online') {
                    // For online games, immediately disable further moves until server confirms
                    this.isMyTurn = false;
                    document.getElementById('status').textContent = "Waiting for opponent...";
                    console.log('🌐 Move sent to server, turn disabled until server response...');
                } else {
                    // For local/CPU games, use string system (red, black)
                    this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
                    document.getElementById('status').textContent = `${this.currentPlayer}'s turn`;
                    
                    // Trigger CPU move if it's now black's turn (CPU turn)
                    if (this.currentPlayer === 'black' && this.gameMode === 'cpu') {
                        console.log('🤖 Triggering CPU checkers move...');
                        setTimeout(() => this.cpuCheckersMove(), 1000); // Delay for better UX
                    }
                }
                console.log(`Turn switched to ${this.currentPlayer}`);
            } else {
                console.log('Invalid move attempted');
            }
            
            this.selectedPiece = null;
        }
    }

    highlightPossibleMoves(row, col) {
        // Clear any existing highlights
        this.clearPossibleMoves();
        
        // Target checkers board specifically to avoid conflicts
        const piece = document.querySelector(`#checkers-board [data-row="${row}"][data-col="${col}"] .checkers-piece`);
        if (!piece) {
            console.log(`❌ No piece found at (${row},${col})`);
            return;
        }
        
        const isKing = piece.dataset.king === 'true';
        const color = piece.dataset.color;
        
        console.log(`🎯 Highlighting moves for ${color} piece at (${row},${col}), isKing: ${isKing}`);
        
        // Check all possible diagonal moves
        const directions = isKing ? 
            [[-1, -1], [-1, 1], [1, -1], [1, 1]] : // Kings can move in all directions
            color === 'red' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]; // Red moves up (negative), black moves down (positive)
        
        console.log(`🧭 Movement directions:`, directions);
        
        directions.forEach(([dRow, dCol]) => {
            // Check 1-square moves
            const newRow = row + dRow;
            const newCol = col + dCol;
            console.log(`🔍 Checking 1-square move to (${newRow},${newCol})`);
            
            if (this.isValidPosition(newRow, newCol) && this.isValidCheckersMove(row, col, newRow, newCol)) {
                const targetSquare = document.querySelector(`#checkers-board [data-row="${newRow}"][data-col="${newCol}"]`);
                if (targetSquare) {
                    targetSquare.classList.add('possible-move');
                    console.log(`✅ Added possible-move highlight to (${newRow},${newCol})`);
                } else {
                    console.log(`❌ Could not find target square at (${newRow},${newCol})`);
                }
            } else {
                console.log(`❌ Invalid move to (${newRow},${newCol})`);
            }
            
            // Check 2-square moves (captures)
            const jumpRow = row + (dRow * 2);
            const jumpCol = col + (dCol * 2);
            console.log(`🔍 Checking 2-square move to (${jumpRow},${jumpCol})`);
            
            if (this.isValidPosition(jumpRow, jumpCol) && this.isValidCheckersMove(row, col, jumpRow, jumpCol)) {
                const targetSquare = document.querySelector(`#checkers-board [data-row="${jumpRow}"][data-col="${jumpCol}"]`);
                if (targetSquare) {
                    targetSquare.classList.add('possible-move capture-move');
                    console.log(`✅ Added capture-move highlight to (${jumpRow},${jumpCol})`);
                } else {
                    console.log(`❌ Could not find target square at (${jumpRow},${jumpCol})`);
                }
            } else {
                console.log(`❌ Invalid capture to (${jumpRow},${jumpCol})`);
            }
        });
    }

    clearPossibleMoves() {
        document.querySelectorAll('.checkers-square').forEach(square => {
            square.classList.remove('possible-move', 'capture-move');
        });
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    isValidCheckersMove(fromRow, fromCol, toRow, toCol) {
        console.log(`🔍 Validating move from (${fromRow},${fromCol}) to (${toRow},${toCol})`);
        
        // Basic move validation for checkers
        const piece = this.selectedPiece.piece;
        const isKing = piece.dataset.king === 'true';
        const color = piece.dataset.color;
        
        console.log(`🔴 Piece color: ${color}, isKing: ${isKing}`);
        
        // Check if destination is empty and on a dark square - TARGET CHECKERS BOARD SPECIFICALLY
        const toSquare = document.querySelector(`#checkers-board [data-row="${toRow}"][data-col="${toCol}"]`);
        console.log(`🎯 Destination square:`, toSquare);
        console.log(`🎯 Is dark square:`, toSquare?.classList.contains('dark'));
        console.log(`🎯 Has piece:`, !!toSquare?.querySelector('.checkers-piece'));
        
        if (!toSquare || !toSquare.classList.contains('dark') || toSquare.querySelector('.checkers-piece')) {
            console.log('❌ Invalid destination: not dark or occupied');
            return false;
        }
        
        const rowDiff = toRow - fromRow;
        const colDiff = Math.abs(toCol - fromCol);
        
        console.log(`📏 Row difference: ${rowDiff}, Column difference: ${colDiff}`);
        
        // Regular pieces can only move diagonally forward
        if (!isKing) {
            const correctDirection = (color === 'red' && rowDiff < 0) || (color === 'black' && rowDiff > 0);
            console.log(`🧭 Correct direction for ${color}: ${correctDirection} (rowDiff: ${rowDiff})`);
            if (!correctDirection) {
                console.log('❌ Wrong direction for non-king piece');
                return false;
            }
        }
        
        // Check for simple move (1 square diagonally)
        if (Math.abs(rowDiff) === 1 && colDiff === 1) {
            console.log('✅ Valid simple diagonal move');
            return true;
        }
        
        // Check for capture move (2 squares diagonally)
        if (Math.abs(rowDiff) === 2 && colDiff === 2) {
            const midRow = fromRow + rowDiff / 2;
            const midCol = fromCol + (toCol - fromCol) / 2;
            const midSquare = document.querySelector(`#checkers-board [data-row="${midRow}"][data-col="${midCol}"]`);
            const midPiece = midSquare.querySelector('.checkers-piece');
            
            // There must be an opponent piece to capture
            return midPiece && midPiece.dataset.color !== color;
        }
        
        return false;
    }

    applyCheckersMove(from, to, pieceColor, captured, isKing, player) {
        // Apply a checkers move received from another player
        console.log(`🌐 Applying move from player ${player}: ${pieceColor} piece (${from.row},${from.col}) to (${to.row},${to.col})`);
        
        // Find the piece to move
        const fromSquare = document.querySelector(`#checkers-board [data-row="${from.row}"][data-col="${from.col}"]`);
        const toSquare = document.querySelector(`#checkers-board [data-row="${to.row}"][data-col="${to.col}"]`);
        const piece = fromSquare.querySelector('.checkers-piece');
        
        if (piece && toSquare) {
            // Move the piece
            toSquare.appendChild(piece);
            
            // Handle capture
            if (captured) {
                const midRow = from.row + (to.row - from.row) / 2;
                const midCol = from.col + (to.col - from.col) / 2;
                const midSquare = document.querySelector(`#checkers-board [data-row="${midRow}"][data-col="${midCol}"]`);
                const capturedPiece = midSquare?.querySelector('.checkers-piece');
                if (capturedPiece) {
                    capturedPiece.remove();
                    this.sounds.checkersCapture.play(); // Play capture sound for online move
                    console.log(`🌐 Captured piece removed at (${midRow},${midCol})`);
                }
            } else {
                this.sounds.checkersMove.play(); // Play regular move sound for online move
            }
            
            // Handle king promotion
            if (isKing && piece.dataset.king !== 'true') {
                piece.dataset.king = 'true';
                piece.classList.add('king');
                console.log(`🌐 Piece promoted to King!`);
            }
            
            // For online games, don't switch turns locally - server manages turns
            // Turn switching is handled by moveConfirmed for the move maker
            // and by server state synchronization for the receiver
            console.log(`🌐 Move applied from player ${player}`);
        }
    }

    checkCapture(fromRow, fromCol, toRow, toCol) {
        const rowDiff = toRow - fromRow;
        const colDiff = toCol - fromCol;
        
        if (Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 2) {
            const midRow = fromRow + rowDiff / 2;
            const midCol = fromCol + colDiff / 2;
            // Target checkers board specifically to avoid conflicts with Connect 4 board
            const midSquare = document.querySelector(`#checkers-board [data-row="${midRow}"][data-col="${midCol}"]`);
            console.log(`🎯 Checking capture: midSquare at (${midRow},${midCol}):`, midSquare);
            const capturedPiece = midSquare?.querySelector('.checkers-piece');
            console.log(`🎯 Captured piece found:`, capturedPiece);
            return capturedPiece;
        }
        
        return null;
    }

    dropPiece(col) {
        if (!this.gameActive || !this.isMyTurn) {
            return;
        }

        if (this.isColumnFull(col)) {
            return;
        }

        if (this.gameMode === 'online') {
            // Send move to server for online games
            this.socket.emit('makeMove', { 
                gameId: this.gameId, 
                col: col,
                player: this.myPlayerNumber
            });
        } else if (this.gameMode === 'cpu') {
            // Handle move locally for CPU games
            this.makeMove(col, this.myPlayerNumber);
        }
    }

    makeMove(col, player, isRemoteMove = false) {
        const row = this.getBottomEmptyRow(col);
        if (row === -1) return false;

        // Update board state
        this.board[row][col] = player;
        
        // Update UI with animation
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        const colorClass = player === 1 ? 'red' : 'yellow';
        
        cell.classList.add('dropping', colorClass);
        
        // Remove dropping class after animation completes
        const handleAnimationEnd = () => {
            cell.classList.remove('dropping');
            cell.removeEventListener('animationend', handleAnimationEnd);
        };
        cell.addEventListener('animationend', handleAnimationEnd);
        
        // Play drop sound for local or opponent moves
        if (!isRemoteMove || (this.gameMode === 'online' && player !== this.myPlayerNumber)) {
            this.sounds.drop.play();
        }
        
        // Check for win
        if (this.checkWin(row, col, player)) {
            this.gameActive = false;
            const winningCells = this.getWinningCells(row, col, player);
            this.highlightWinningCells(winningCells);
            
            if (this.gameMode === 'online' && !isRemoteMove) {
                this.socket.emit('gameWon', { 
                    gameId: this.gameId, 
                    winner: player,
                    winningCells: winningCells
                });
            } else if (this.gameMode === 'cpu') {
                const isWinner = player === this.myPlayerNumber;
                this.sounds.win.play();
                this.showModal(
                    isWinner ? '🎉 You Won!' : '😔 You Lost!',
                    isWinner ? 'Congratulations! You beat the CPU.' : 'The CPU won. Better luck next time!'
                );
            }
            return true;
        }

        // Check for draw
        if (this.isBoardFull()) {
            this.gameActive = false;
            if (this.gameMode === 'online' && !isRemoteMove) {
                this.socket.emit('gameDraw', { gameId: this.gameId });
            } else if (this.gameMode === 'cpu') {
                this.showModal('Game Draw!', "It's a tie! Good game!");
            }
            return true;
        }

        // Switch turns
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        
        if (this.gameMode === 'cpu') {
            this.isMyTurn = this.currentPlayer === this.myPlayerNumber;
        } else {
            // For online games, the turn is simply flipped
            this.isMyTurn = !this.isMyTurn;
        }

    this.updatePlayerIndicators();
    this.updateTurnStatus();

        // Trigger CPU move if it's now its turn
        if (this.gameMode === 'cpu' && !this.isMyTurn) {
            this.cpuMove();
        }

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
        if (this.gameType === 'checkers') {
            // Reset checkers-specific properties
            this.currentPlayer = 'red';
            this.selectedPiece = null;
            
            // Clear any selection highlights
            document.querySelectorAll('.checkers-square').forEach(square => {
                square.classList.remove('selected');
            });
            
            // Recreate the checkers board with initial piece positions
            this.createCheckersBoard();
        } else {
            // Connect 4 reset logic
            this.board = Array(6).fill().map(() => Array(7).fill(0));
            this.currentPlayer = 1;
            
            // Clear visual board
            const cells = document.querySelectorAll('.cell');
            cells.forEach(cell => {
                cell.classList.remove('red', 'yellow', 'winning', 'dropping');
            });
        }
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
        // Connection status now shown only in main header status
        // This method kept for compatibility but does nothing
    }

    showModal(title, message) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        document.getElementById('modal').classList.remove('hidden');
        // Reveal rematch button only for online games (primary positioned right via DOM order)
        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            if (this.gameMode === 'online' && !this.isSpectator && this.inRoom) {
                rematchBtn.classList.remove('hidden');
                rematchBtn.disabled = false;
                rematchBtn.textContent = '🔄 Rematch';
            } else {
                rematchBtn.classList.add('hidden');
            }
        }
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
    this.joinAttempted = 0;
    this.joinErrorEncountered = false;
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

    // Persist name for future sessions / invite auto-fill
    try { if (playerName) localStorage.setItem('c4_name', playerName); } catch (e) {}

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

    try { if (playerName) localStorage.setItem('c4_name', playerName); } catch (e) {}

    this.joinAttempted++;
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
                // Removed color suffix for consistency across modes
                nameElement.textContent = `${player.name}`;
                if (player.number !== this.myPlayerNumber) {
                    this.opponentName = player.name;
                }
                this.playerNameMap[player.number] = player.name;
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
    // Clear typing indicator when message received from opponent
    if (data.playerNumber !== this.myPlayerNumber) this.clearTypingIndicator();
    // Recalculate chat height in case new content causes sidebar overflow relative to board
    this.adjustChatHeight();
        const chatWindow = document.querySelector('.chat-messages-window');
        this.updateScrollShadows && this.updateScrollShadows(chatWindow);
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

    showCPUDifficultyModal() {
        document.getElementById('cpu-difficulty-modal').classList.remove('hidden');
    }

    hideCPUDifficultyModal() {
        document.getElementById('cpu-difficulty-modal').classList.add('hidden');
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
        const cpuBtn = document.getElementById('cpu-game-btn');
        const newBtn = document.getElementById('new-game-btn');
        const joinBtn = document.getElementById('join-game-btn');
        const leaveBtn = document.getElementById('leave-game-btn');

        if (this.gameMode === 'cpu') {
            // CPU mode: offer New CPU Game (primary), Back to Menu (secondary)
            cpuBtn.classList.add('hidden');
            newBtn.classList.remove('hidden');
            newBtn.textContent = '🔄 New CPU Game';
            newBtn.className = 'btn primary-action';
            joinBtn.classList.remove('hidden');
            joinBtn.textContent = '⬅️ Back to Menu';
            joinBtn.className = 'btn secondary-action';
            leaveBtn.classList.add('hidden');
        } else if (!this.inRoom) {
            // Lobby: primary = New Online Game, secondaries = Join & CPU
            cpuBtn.classList.remove('hidden');
            cpuBtn.className = 'btn secondary-action';
            newBtn.classList.remove('hidden');
            newBtn.textContent = '🎯 New Online Game';
            newBtn.className = 'btn primary-action';
            joinBtn.classList.remove('hidden');
            joinBtn.textContent = '🚪 Join Online Game';
            joinBtn.className = 'btn secondary-action';
            leaveBtn.classList.add('hidden');
            if (!this.isSpectator) {
                this.requestLobby();
            }
        } else if (this.inRoom && this.gameMode === 'online') {
            // In an online game: hide join & new buttons; ensure leave visible
            cpuBtn.classList.add('hidden');
            newBtn.classList.add('hidden');
            joinBtn.classList.add('hidden');
            leaveBtn.classList.remove('hidden');
        } else {
            // In online game: hide mode selection, show leave in toolbar
            cpuBtn.classList.add('hidden');
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
        this.hideLeaveConfirmation();
        if (this.gameMode === 'online' && this.socket && this.gameId) {
            this.socket.emit('leaveGame');
        } else {
            // For CPU games or if not in a room, just reset to lobby
            this.resetToLobbyState('You have left the game.');
        }
    }

    resetToLobbyState(statusMessage) {
        if (this.gameMode === 'online' && this.socket.disconnected) {
            this.socket.connect();
        }
        this.gameId = null;
        this.myPlayerNumber = null;
        this.gameMode = null;
    this.isSpectator = false;
    this.spectatingGameId = null;
        // Keep myPlayerName for convenience in modals
        this.inRoom = false;
        this.gameActive = false;
        document.getElementById('room-info').textContent = '';
        this.disableChatInput();
        this.resetBoard();
        document.getElementById('player1-name').textContent = 'Player 1';
        document.getElementById('player2-name').textContent = 'Player 2';
        
        // Reset player indicators to default avatars
        const player2Indicator = document.querySelector('.player2 .player-indicator');
        if (player2Indicator) {
            player2Indicator.classList.remove('cpu-freddy', 'cpu-michael', 'cpu-jason');
            player2Indicator.classList.add('yellow');
        }
        this.currentCpuCharacter = null;
        
        this.currentPlayer = 1;
        this.updatePlayerIndicators();
        this.updateControlButtons();
        this.updateStatus(statusMessage || `🎮 ${this.gameType === 'chess' ? '♛ Chess' : '🔴 Connect 4'} selected! Choose a game mode to start.`);
    this.hideInviteActions();
    const stopBtn = document.getElementById('stop-spectating-btn');
    if (stopBtn) stopBtn.classList.add('hidden');
    }

    /* Lobby methods */
    requestLobby() {
        if (!this.socket) return;
        this.socket.emit('lobby:subscribe');
    }

    renderLobby() {
        const containerId = 'lobby-panel';
        let panel = document.getElementById(containerId);
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        // Ensure bottom stack wrapper exists (holds How To Play + Lobby)
        let bottomStack = sidebar.querySelector('.bottom-stack');
        if (!bottomStack) {
            bottomStack = document.createElement('div');
            bottomStack.className = 'bottom-stack';
            // Place directly after existing .game-info if present, else append at end
            const gameInfo = sidebar.querySelector('.game-info');
            if (gameInfo && gameInfo.nextSibling) {
                sidebar.insertBefore(bottomStack, gameInfo.nextSibling);
                bottomStack.appendChild(gameInfo); // move inside wrapper
            } else if (gameInfo) {
                sidebar.removeChild(gameInfo);
                bottomStack.appendChild(gameInfo);
                sidebar.appendChild(bottomStack);
            } else {
                sidebar.appendChild(bottomStack);
            }
        } else {
            // If game-info sits outside, move it in
            const gameInfo = sidebar.querySelector('.game-info:not(.bottom-stack > .game-info)');
            if (gameInfo && gameInfo.parentElement !== bottomStack) {
                bottomStack.insertBefore(gameInfo, bottomStack.firstChild);
            }
        }
        if (!panel) {
            panel = document.createElement('div');
            panel.id = containerId;
            panel.className = 'lobby-panel';
            bottomStack.appendChild(panel);
        } else if (panel.parentElement !== bottomStack) {
            bottomStack.appendChild(panel);
        }
        if (!this.lobbyGames || this.lobbyGames.length === 0) {
            panel.innerHTML = '<div class="lobby-empty">No open games. Create one!</div>';
            // register for scroll shadow updates even if empty
            this._registerShadowElement && this._registerShadowElement(panel);
            this.updateScrollShadows && this.updateScrollShadows(panel);
            return;
        }
                        const rows = this.lobbyGames.map(g => {
                            const joinable = g.status === 'waiting';
                            const isMyCurrentGame = (this.gameId && g.gameId === this.gameId);
                            const showJoin = joinable && !this.inRoom && !this.isSpectator; // can't join while in or spectating
                            let spectateMarkup = '';
                            if (this.isSpectator) {
                                if (this.spectatingGameId === g.gameId) {
                                    spectateMarkup = `<button class=\"btn tiny spectating\" disabled>Spectating</button>`;
                                } // do not show spectate buttons for other games while currently spectating
                            } else if (!isMyCurrentGame) {
                                spectateMarkup = `<button class=\"btn tiny secondary\" data-spectate-game-id=\"${g.gameId}\" ${joinable?'disabled':''}>Spectate</button>`;
                            }
                            return `<div class=\"lobby-row status-${g.status}\">
                                <div class=\"lobby-meta\">
                                  <span class=\"g-id\">${g.gameId}</span>
                                  <span class=\"g-host\">${this.escapeHtml(g.host || '—')}</span>
                                  <span class=\"g-vs\">vs</span>
                                  <span class=\"g-opponent\">${this.escapeHtml(g.opponent || (joinable?'<em>open</em>':'—'))}</span>
                                </div>
                                <div class=\"lobby-actions\">
                                  ${showJoin ? `<button class=\"btn tiny\" data-join-game-id=\"${g.gameId}\">Join</button>` : ''}
                                  ${spectateMarkup}
                                </div>
                            </div>`;
                        }).join('');
        panel.innerHTML = `<div class="lobby-header">Lobby</div>${rows}`;
        this._registerShadowElement && this._registerShadowElement(panel);
        this.updateScrollShadows && this.updateScrollShadows(panel);
    }

    quickJoinGame(gameId) {
        // Show modal join step prefilled
        this.showNameModal();
        this.showNameStep('join');
        const codeInput = document.getElementById('room-code-input');
        codeInput.value = gameId;
        this.validateRoomCodeInput();
    }

    spectateGame(gameId) {
        if (!this.socket) return;
        if (this.inRoom) return; // already playing
        this.socket.emit('spectateGame', { gameId });
    }

    stopSpectating() {
        if (!this.isSpectator) return;
        const gid = this.spectatingGameId;
        if (this.socket && gid) this.socket.emit('stopSpectating', { gameId: gid });
        this.isSpectator = false;
        this.spectatingGameId = null;
        this.gameId = null;
    this.resetBoard();
        const stopBtn = document.getElementById('stop-spectating-btn');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (!this.inRoom) {
            document.getElementById('player1-name').textContent = 'Player 1';
            document.getElementById('player2-name').textContent = 'Player 2';
        }
        this.updateStatus('Lobby: select a game to Join or Spectate');
        this.updateControlButtons();
        this.renderLobby();
        this.adjustChatHeight();
    }

    startCPUGame(difficulty = 'easy') {
        this.gameMode = 'cpu';
        this.cpuDifficulty = difficulty;
        this.gameActive = true;
        this.inRoom = true; // Use inRoom to manage button visibility
        this.myPlayerNumber = 1;
        this.isMyTurn = true;
        
        // Select random CPU character
        const cpuCharacters = [
            { name: 'Freddy', cssClass: 'cpu-freddy' },
            { name: 'Michael', cssClass: 'cpu-michael' },
            { name: 'Jason', cssClass: 'cpu-jason' }
        ];
        this.currentCpuCharacter = cpuCharacters[Math.floor(Math.random() * cpuCharacters.length)];
        
        // Define CPU display name first
        const difficultyLabels = {
            'easy': 'Easy',
            'medium': 'Medium', 
            'hard': 'Hard'
        };
        const cpuDisplayName = `${this.currentCpuCharacter.name} (${difficultyLabels[difficulty]} CPU)`;
        
        this.resetBoard();
        
        // Initialize the appropriate game board based on game type
        if (this.gameType === 'checkers') {
            // No need to call createCheckersBoard again since resetBoard() already does it
            this.updateStatus(`🔴⚫ Playing Checkers vs ${cpuDisplayName} • Red's turn!`);
        } else {
            this.updateStatus(`🤖 Playing vs ${cpuDisplayName} • Your turn!`);
        }
        
        document.getElementById('player1-name').textContent = 'You';
        document.getElementById('player2-name').textContent = cpuDisplayName;
        
        // Update player 2 avatar to use the selected CPU character
        const player2Indicator = document.querySelector('.player2 .player-indicator');
        if (player2Indicator) {
            // Remove any existing CPU classes
            player2Indicator.classList.remove('yellow', 'cpu-freddy', 'cpu-michael', 'cpu-jason');
            // Add the selected CPU character class
            player2Indicator.classList.add(this.currentCpuCharacter.cssClass);
        }
        
        this.updatePlayerIndicators();
        if (this.gameType !== 'checkers') {
            this.updateStatus(`🤖 Playing vs ${cpuDisplayName} • Your turn!`);
        }
        this.updateControlButtons();
        this.disableChatInput(); // No chat in CPU mode
        document.getElementById('room-info').textContent = `Single Player vs ${cpuDisplayName}`;
        this.hideInviteActions();
        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) rematchBtn.classList.add('hidden');
    }

    /* Invite Feature Helpers */
    buildInviteUrl() {
        const params = new URLSearchParams();
        if (this.gameId) params.set('room', this.gameId);
        if (this.myPlayerName) params.set('host', this.myPlayerName);
        return `${this.inviteBaseUrl}?${params.toString()}`;
    }

    showInviteActions() {
        if (this.gameMode === 'cpu') return; // Not for CPU games
        const el = document.getElementById('invite-actions');
        if (!el) return;
        el.classList.remove('hidden');
        // Update feedback area with quick link preview if room present
        if (this.gameId) {
            const fb = document.getElementById('invite-feedback');
            if (fb) {
                fb.textContent = 'Share this link with a friend to join.';
                fb.className = 'invite-feedback';
            }
        }
    // Any expansion here can push sidebar below board; correct it
    setTimeout(()=>this.adjustChatHeight(), 20);
    }

    hideInviteActions() {
        const el = document.getElementById('invite-actions');
        if (el) el.classList.add('hidden');
        const fb = document.getElementById('invite-feedback');
        if (fb) fb.textContent = '';
    setTimeout(()=>this.adjustChatHeight(), 20);
    }

    showInviteFeedback(msg, success) {
        const fb = document.getElementById('invite-feedback');
        if (!fb) return;
        fb.textContent = msg;
        fb.className = 'invite-feedback ' + (success ? 'success' : 'error');
        clearTimeout(this._inviteTimer);
        this._inviteTimer = setTimeout(()=>{
            if (fb.classList.contains('success')) fb.textContent = '';
        }, 2500);
    }

    processInviteParams() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        const host = params.get('host');
        if (room) {
            // Auto-open modal in join mode; prefill room code; focus name
            this.showNameModal();
            this.showNameStep('join');
            // If host provided, adjust subtitle message
            const codeInput = document.getElementById('room-code-input');
            codeInput.value = room.toUpperCase();
            this.validateRoomCodeInput();
            // If player has localStorage name, set it
            try {
                const stored = localStorage.getItem('c4_name');
                if (stored) {
                    const nameInput = document.getElementById('player-name');
                    nameInput.value = stored;
                    this.validateNameInput();
                }
            } catch (e) {}
            const subtitle = document.getElementById('modal-subtitle');
            if (subtitle) {
                subtitle.textContent = host ? `Joining ${host}'s game` : 'Enter your name to join';
            }
        }
    }

    /* Typing indicator helpers */
    handleTyping() {
        if (!this.socket || !this.gameId || this.gameMode !== 'online') return;
        if (!this.iAmTyping) {
            this.iAmTyping = true;
            this.sendTyping(true);
        }
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.iAmTyping = false;
            this.sendTyping(false);
        }, 1500);
    }

    sendTyping(isTyping) {
        if (!this.socket || !this.gameId || this.gameMode !== 'online') return;
        this.socket.emit('typing', { gameId: this.gameId, isTyping });
    }

    updateTypingIndicator({ isTyping, playerName }) {
        const el = document.getElementById('typing-indicator');
        if (!el) return;
        if (isTyping) {
            el.classList.remove('hidden');
            const safe = this.escapeHtml(playerName || 'Opponent');
            el.innerHTML = `${safe} is typing <span>.</span><span>.</span><span>.</span>`;
        } else {
            this.clearTypingIndicator();
        }
    }

    clearTypingIndicator() {
        const el = document.getElementById('typing-indicator');
        if (!el) return;
        el.classList.add('hidden');
        el.textContent = '';
    }

    cpuMove() {
        if (!this.gameActive || this.currentPlayer !== 2) return;
        
        // Add a delay to make it feel more natural
        setTimeout(() => {
            const availableCols = [];
            for (let col = 0; col < 7; col++) {
                if (!this.isColumnFull(col)) {
                    availableCols.push(col);
                }
            }

            if (availableCols.length === 0) return;

            let chosenCol;
            
            switch (this.cpuDifficulty) {
                case 'easy':
                    chosenCol = this.getRandomMove(availableCols);
                    break;
                case 'medium':
                    chosenCol = this.getMediumMove(availableCols);
                    break;
                case 'hard':
                    chosenCol = this.getHardMove(availableCols);
                    break;
                default:
                    chosenCol = this.getRandomMove(availableCols);
            }

            this.makeMove(chosenCol, 2); // CPU is player 2
        }, 1000);
    }

    // Easy difficulty: Random moves
    getRandomMove(availableCols) {
        return availableCols[Math.floor(Math.random() * availableCols.length)];
    }

    // Medium difficulty: Look ahead, block opponent wins, try to win
    getMediumMove(availableCols) {
        // First priority: Check if CPU can win
        for (let col of availableCols) {
            const row = this.getBottomEmptyRow(col);
            this.board[row][col] = 2; // Simulate CPU move
            if (this.checkWin(row, col, 2)) {
                this.board[row][col] = 0; // Undo simulation
                return col;
            }
            this.board[row][col] = 0; // Undo simulation
        }

        // Second priority: Block opponent wins
        for (let col of availableCols) {
            const row = this.getBottomEmptyRow(col);
            this.board[row][col] = 1; // Simulate player move
            if (this.checkWin(row, col, 1)) {
                this.board[row][col] = 0; // Undo simulation
                return col;
            }
            this.board[row][col] = 0; // Undo simulation
        }

        // Third priority: Try to create opportunities (center columns preferred)
        const centerCols = availableCols.filter(col => col >= 2 && col <= 4);
        if (centerCols.length > 0) {
            return centerCols[Math.floor(Math.random() * centerCols.length)];
        }

        // Fallback: Random move
        return this.getRandomMove(availableCols);
    }

    // Hard difficulty: Minimax with alpha-beta pruning
    getHardMove(availableCols) {
        const depth = 6; // Look ahead 6 moves
        let bestScore = -Infinity;
        let bestCol = availableCols[0];

        for (let col of availableCols) {
            const row = this.getBottomEmptyRow(col);
            this.board[row][col] = 2; // Simulate CPU move
            
            const score = this.minimax(depth - 1, -Infinity, Infinity, false);
            
            this.board[row][col] = 0; // Undo simulation
            
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }

        return bestCol;
    }

    // Minimax algorithm with alpha-beta pruning
    minimax(depth, alpha, beta, isMaximizing) {
        // Check for terminal states
        const winner = this.evaluateBoard();
        if (winner === 2) return 1000 + depth; // CPU wins (prefer quicker wins)
        if (winner === 1) return -1000 - depth; // Player wins (delay losses)
        if (this.isBoardFull() || depth === 0) return this.evaluatePosition();

        const availableCols = [];
        for (let col = 0; col < 7; col++) {
            if (!this.isColumnFull(col)) {
                availableCols.push(col);
            }
        }

        if (isMaximizing) {
            let maxScore = -Infinity;
            for (let col of availableCols) {
                const row = this.getBottomEmptyRow(col);
                this.board[row][col] = 2;
                
                const score = this.minimax(depth - 1, alpha, beta, false);
                maxScore = Math.max(score, maxScore);
                alpha = Math.max(alpha, score);
                
                this.board[row][col] = 0;
                
                if (beta <= alpha) break; // Alpha-beta pruning
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (let col of availableCols) {
                const row = this.getBottomEmptyRow(col);
                this.board[row][col] = 1;
                
                const score = this.minimax(depth - 1, alpha, beta, true);
                minScore = Math.min(score, minScore);
                beta = Math.min(beta, score);
                
                this.board[row][col] = 0;
                
                if (beta <= alpha) break; // Alpha-beta pruning
            }
            return minScore;
        }
    }

    // Evaluate the current board state (used by minimax)
    evaluateBoard() {
        // Check for wins
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                if (this.board[row][col] !== 0) {
                    if (this.checkWin(row, col, this.board[row][col])) {
                        return this.board[row][col];
                    }
                }
            }
        }
        return 0; // No winner
    }

    // Evaluate position strength (used by minimax when no immediate win)
    evaluatePosition() {
        let score = 0;
        
        // Evaluate all possible 4-piece windows
        // Horizontal
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 4; col++) {
                const window = [
                    this.board[row][col],
                    this.board[row][col + 1],
                    this.board[row][col + 2],
                    this.board[row][col + 3]
                ];
                score += this.evaluateWindow(window);
            }
        }

        // Vertical
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 7; col++) {
                const window = [
                    this.board[row][col],
                    this.board[row + 1][col],
                    this.board[row + 2][col],
                    this.board[row + 3][col]
                ];
                score += this.evaluateWindow(window);
            }
        }

        // Diagonal (positive slope)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                const window = [
                    this.board[row][col],
                    this.board[row + 1][col + 1],
                    this.board[row + 2][col + 2],
                    this.board[row + 3][col + 3]
                ];
                score += this.evaluateWindow(window);
            }
        }

        // Diagonal (negative slope)
        for (let row = 3; row < 6; row++) {
            for (let col = 0; col < 4; col++) {
                const window = [
                    this.board[row][col],
                    this.board[row - 1][col + 1],
                    this.board[row - 2][col + 2],
                    this.board[row - 3][col + 3]
                ];
                score += this.evaluateWindow(window);
            }
        }

        // Prefer center columns
        const centerCol = 3;
        for (let row = 0; row < 6; row++) {
            if (this.board[row][centerCol] === 2) score += 3;
            if (this.board[row][centerCol] === 1) score -= 3;
        }

        return score;
    }

    // Evaluate a 4-piece window for scoring
    evaluateWindow(window) {
        let score = 0;
        const cpuPieces = window.filter(cell => cell === 2).length;
        const playerPieces = window.filter(cell => cell === 1).length;
        const empty = window.filter(cell => cell === 0).length;

        // CPU scoring
        if (cpuPieces === 4) score += 100;
        else if (cpuPieces === 3 && empty === 1) score += 10;
        else if (cpuPieces === 2 && empty === 2) score += 2;

        // Player blocking (negative score for player advantages)
        if (playerPieces === 4) score -= 100;
        else if (playerPieces === 3 && empty === 1) score -= 80;
        else if (playerPieces === 2 && empty === 2) score -= 2;

        return score;
    }

    updateTurnStatus() {
        if (this.isSpectator) {
            if (!this.gameActive) {
                this.updateStatus('👀 Spectating • Game finished');
                return;
            }
            const pName = this.playerNameMap[this.currentPlayer] || (this.currentPlayer===1? 'Red':'Yellow');
            this.updateStatus(`👀 Spectating • ${this.escapeHtml(pName)}'s turn`);
            return;
        }
        if (this.gameMode === 'cpu') {
            this.updateStatus(this.isMyTurn ? 'Your turn!' : 'CPU is thinking...');
            return;
        }
        if (this.gameMode === 'online') {
            this.updateStatus(this.isMyTurn ? 'Your turn!' : "Opponent's turn");
            return;
        }
    }

    // CPU AI for checkers
    cpuCheckersMove() {
        if (!this.gameActive || this.currentPlayer !== 'black' || this.gameType !== 'checkers') return;
        
        console.log('🤖 CPU making checkers move...');
        
        // Get all black pieces and their possible moves
        const blackPieces = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.querySelector(`#checkers-board [data-row="${row}"][data-col="${col}"]`);
                const piece = square?.querySelector('.checkers-piece.black');
                if (piece) {
                    blackPieces.push({ row, col, piece, square });
                }
            }
        }
        
        // Find all possible moves for all black pieces
        const possibleMoves = [];
        for (const pieceInfo of blackPieces) {
            const moves = this.getCheckersMovesForPiece(pieceInfo.row, pieceInfo.col);
            for (const move of moves) {
                possibleMoves.push({
                    from: { row: pieceInfo.row, col: pieceInfo.col },
                    to: { row: move.row, col: move.col },
                    piece: pieceInfo.piece,
                    fromSquare: pieceInfo.square,
                    isCapture: move.isCapture
                });
            }
        }
        
        if (possibleMoves.length === 0) {
            console.log('🤖 No moves available for CPU');
            return;
        }
        
        // Simple AI: Prefer captures, otherwise random move
        let chosenMove = possibleMoves.find(move => move.isCapture) || 
                        possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        
        console.log(`🤖 CPU chose move from (${chosenMove.from.row},${chosenMove.from.col}) to (${chosenMove.to.row},${chosenMove.to.col})`);
        
        // Execute the move
        const toSquare = document.querySelector(`#checkers-board [data-row="${chosenMove.to.row}"][data-col="${chosenMove.to.col}"]`);
        toSquare.appendChild(chosenMove.piece);
        
        // Handle capture
        if (chosenMove.isCapture) {
            const midRow = chosenMove.from.row + (chosenMove.to.row - chosenMove.from.row) / 2;
            const midCol = chosenMove.from.col + (chosenMove.to.col - chosenMove.from.col) / 2;
            const midSquare = document.querySelector(`#checkers-board [data-row="${midRow}"][data-col="${midCol}"]`);
            const capturedPiece = midSquare?.querySelector('.checkers-piece');
            if (capturedPiece) {
                capturedPiece.remove();
                this.sounds.checkersCapture.play(); // Play capture sound for CPU move
                console.log('🤖 CPU captured a piece!');
            }
        } else {
            this.sounds.checkersMove.play(); // Play regular move sound for CPU move
        }
        
        // Check for king promotion
        if (chosenMove.to.row === 7) {
            chosenMove.piece.dataset.king = 'true';
            chosenMove.piece.classList.add('king');
            console.log('🤖 CPU piece promoted to King!');
        }
        
        // Switch back to human player
        this.currentPlayer = 'red';
        document.getElementById('status').textContent = "red's turn";
        console.log('🤖 CPU move complete, switched to red');
    }

    // Get possible moves for a specific piece at given position
    getCheckersMovesForPiece(row, col) {
        const moves = [];
        const piece = document.querySelector(`#checkers-board [data-row="${row}"][data-col="${col}"] .checkers-piece`);
        if (!piece) return moves;
        
        const isKing = piece.dataset.king === 'true';
        const color = piece.dataset.color;
        
        // Define possible move directions
        const directions = [];
        if (color === 'black' || isKing) directions.push([1, 1], [1, -1]); // Forward for black
        if (color === 'red' || isKing) directions.push([-1, 1], [-1, -1]); // Forward for red
        
        for (const [dRow, dCol] of directions) {
            // Check simple move (1 square)
            const newRow = row + dRow;
            const newCol = col + dCol;
            if (this.isValidPosition(newRow, newCol)) {
                const targetSquare = document.querySelector(`#checkers-board [data-row="${newRow}"][data-col="${newCol}"]`);
                if (targetSquare?.classList.contains('dark') && !targetSquare.querySelector('.checkers-piece')) {
                    moves.push({ row: newRow, col: newCol, isCapture: false });
                }
            }
            
            // Check capture move (2 squares)
            const jumpRow = row + dRow * 2;
            const jumpCol = col + dCol * 2;
            if (this.isValidPosition(jumpRow, jumpCol)) {
                const midSquare = document.querySelector(`#checkers-board [data-row="${newRow}"][data-col="${newCol}"]`);
                const targetSquare = document.querySelector(`#checkers-board [data-row="${jumpRow}"][data-col="${jumpCol}"]`);
                const midPiece = midSquare?.querySelector('.checkers-piece');
                
                if (midPiece && midPiece.dataset.color !== color && 
                    targetSquare?.classList.contains('dark') && !targetSquare.querySelector('.checkers-piece')) {
                    moves.push({ row: jumpRow, col: jumpCol, isCapture: true });
                }
            }
        }
        
        return moves;
    }

    /* Layout helper: keep chat bottom from extending below board bottom on desktop */
    adjustChatHeight() {
        const desktop = window.innerWidth >= 1051;
        const chatWindow = document.querySelector('.chat-messages-window');
        if (!chatWindow) return;

        // On mobile / narrow layouts let CSS handle stacking and natural height
        if (!desktop) {
            chatWindow.style.height = '';
            chatWindow.style.maxHeight = '';
            const sidebarMobile = document.querySelector('.sidebar');
            if (sidebarMobile) sidebarMobile.style.height = '';
            return;
        }

        const gameArea = document.querySelector('.game-area');
        const sidebar = document.querySelector('.sidebar');
        const lobbyPanel = document.getElementById('lobby-panel');
        if (!gameArea || !sidebar) return;
        const boardHeight = gameArea.offsetHeight; // total left column height
    // Lock sidebar height to board height for alignment; enable flex internals to distribute space
    sidebar.style.height = boardHeight + 'px';

    // Reset dynamic heights (flex will stretch). We'll prefer max-height only if overflow scenario.
    chatWindow.style.height = '';
    chatWindow.style.maxHeight = '';
        if (lobbyPanel) lobbyPanel.style.maxHeight = '';

        const minChat = 120;
        const minLobby = 70;

        const measure = () => ({
            sidebar: sidebar.offsetHeight,
            chat: chatWindow.offsetHeight,
            lobby: lobbyPanel ? lobbyPanel.offsetHeight : 0
        });

        let sizes = measure();

    // For flex layout we only intervene if overflow occurs beyond board height
    if (sizes.sidebar <= boardHeight) {
            // After normalization no overflow; still refresh shadows and exit
            this.updateScrollShadows && this.updateScrollShadows(chatWindow);
            const lobbyPanel2 = document.getElementById('lobby-panel');
            if (lobbyPanel2) this.updateScrollShadows && this.updateScrollShadows(lobbyPanel2);
            return;
        }

    // First shrink chat via max-height (allow scroll within)
    let overflow = sizes.sidebar - boardHeight;
    let chatTarget = Math.max(minChat, sizes.chat - overflow);
    chatWindow.style.maxHeight = chatTarget + 'px';
        sizes = measure();

        if (sizes.sidebar <= boardHeight) return; // done

        // Still overflowing; shrink lobby panel if present
        if (lobbyPanel) {
            overflow = sizes.sidebar - boardHeight;
            const lobbyTarget = Math.max(minLobby, sizes.lobby - overflow);
            lobbyPanel.style.maxHeight = lobbyTarget + 'px';
            sizes = measure();
        }

        // If still a pixel or two off due to rounding, allow chat slight further shrink
        if (sizes.sidebar > boardHeight && chatTarget > minChat) {
            const finalOverflow = sizes.sidebar - boardHeight;
            chatTarget = Math.max(minChat, chatTarget - finalOverflow);
            chatWindow.style.maxHeight = chatTarget + 'px';
        }
        // Refresh scroll shadows
        this.updateScrollShadows && this.updateScrollShadows(chatWindow);
        if (lobbyPanel) this.updateScrollShadows && this.updateScrollShadows(lobbyPanel);
    }

    /* Scroll shadow helpers */
    _registerShadowElement(el) {
        if (!el) return;
        el.classList.add('scroll-shadow');
        if (!this._shadowElements) this._shadowElements = new Set();
        this._shadowElements.add(el);
        if (!el._c4ShadowListener) {
            el.addEventListener('scroll', () => this.updateScrollShadows(el));
            el._c4ShadowListener = true;
        }
    }

    initScrollShadows() {
        this._registerShadowElement(document.querySelector('.chat-messages-window'));
        const lobby = document.getElementById('lobby-panel');
        if (lobby) this._registerShadowElement(lobby);
        this.refreshAllScrollShadows();
    }

    refreshAllScrollShadows() {
        if (!this._shadowElements) return;
        this._shadowElements.forEach(el => this.updateScrollShadows(el));
    }

    updateScrollShadows(el) {
        if (!el) return;
        const atTop = el.scrollTop <= 1;
        const atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= 1;
        el.classList.toggle('has-top-shadow', !atTop);
        el.classList.toggle('has-bottom-shadow', !atBottom);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.__c4instance = new Connect4Game();
    // After images (player avatars/logo) load, recalc chat height since board container height may change
    window.addEventListener('load', () => {
        if (window.__c4instance && typeof window.__c4instance.adjustChatHeight === 'function') {
            window.__c4instance.adjustChatHeight();
        }
    });
});
