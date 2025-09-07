# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a real-time multiplayer Connect 4 game built with Node.js, Express, and Socket.IO. Players can create or join game rooms and play Connect 4 over the internet through WebSocket connections.

## Development Commands

### Core Operations
```bash
# Install dependencies
npm install

# Start the server (development and production)
npm start
# OR
npm run dev
```

### Testing the Game
- The server runs on `http://localhost:3000` by default
- Open multiple browser windows/tabs to test multiplayer functionality locally
- Use different browsers or devices on the same network for full multiplayer testing
- Check browser console for Socket.IO connection issues

## Architecture Overview

### Real-time Multiplayer System
The application uses a **room-based multiplayer architecture** with Socket.IO plus an in-memory lobby & spectator system:

- **Server-side game state**: Each game room maintains authoritative state in the `Connect4Game` class
- **Client-server synchronization**: All moves are validated server-side and broadcasted to both players & any spectators
- **Room management**: Games are identified by random 6-character room IDs and cleaned up when empty
- **Lobby subscription**: Connected clients can subscribe to lobby updates (list of active games with status)
- **Spectators**: Unlimited spectators per game get read-only snapshots (board, players, recent chat, current turn)

### Key Components

#### Server Architecture (`server.js`)
- **Express server** serves static files and handles HTTP requests
- **Socket.IO server** manages WebSocket connections and real-time communication
- **Connect4Game class** encapsulates complete game logic:
  - Board state management (6x7 grid)
  - Win detection in 4 directions (horizontal, vertical, both diagonals)
  - Player management and turn validation
  - Game lifecycle (creation, joining, moves, completion)

#### Client Architecture (`js/game.js`)
- **Connect4Game class** mirrors server logic for immediate UI updates
- **Socket.IO client** handles real-time communication
- **Event-driven UI** updates based on server messages
- **Local state** synchronized with server for responsiveness

### Game Flow
1. **Room Creation**: Player 1 creates game → gets room ID
2. **Room Joining**: Player 2 joins using room ID
3. **Game Start**: Both players connected → game begins
4. **Turn Management**: Server enforces turn order and validates moves
5. **Win/Draw Detection**: Server determines game end and notifies players
6. **Cleanup**: Empty rooms are automatically removed

### Socket Events
**Client → Server**
- `createGame`
- `joinGame`
- `leaveGame`
- `makeMove`
- `requestRematch`
- `sendChatMessage`
- `typing`
- `lobby:subscribe` / `lobby:unsubscribe`
- `spectateGame`
- `stopSpectating`

**Server → Client**
- `gameCreated`
- `gameJoined`
- `gameStart`
- `playersUpdated`
- `moveMade`
- `gameWon`
- `gameDraw`
- `playerDisconnected`
- `rematchVote`
- `rematchStarted`
- `chatMessage`
- `typing`
- `lobby:update`
- `spectatorJoined` (initial state snapshot)
- `spectateEnded` (optional signal if spectating forcibly ends)
- `error`

**Notes**
- Lobby updates are broadcast when games are created, joined, left, finished, or removed.
- Spectators are prevented from triggering player-only events (move, rematch, leave-as-player).

## File Structure & Responsibilities

- **`server.js`**: Complete backend with Socket.IO, game logic, and room management
- **`js/game.js`**: Frontend game controller with UI updates and server communication
- **`index.html`**: Game interface with board, controls, and status displays
- **`css/style.css`**: Complete styling including animations and responsive design

## Development Notes

### Adding New Features
- **Game logic changes**: Must be implemented in both server and client `Connect4Game` classes
- **New socket events**: Add to both server event handlers and client socket listeners
- **UI changes**: Update HTML structure, CSS styling, and JavaScript event handlers

### Testing Multiplayer Features
- Use browser developer tools Network tab to monitor Socket.IO connections
- Test edge cases: player disconnection, invalid moves, full columns
- Verify game state synchronization between multiple clients

### Deployment Considerations
- Set `PORT` environment variable for production hosting
- The server uses `process.env.PORT || 3000` for port configuration
- CORS is configured to allow all origins - restrict in production
- Games are stored in memory - consider persistent storage for production scale

### Socket.IO Connection Management
- Connection status is displayed in the UI with visual indicators
- Server handles disconnection cleanup automatically
- Games are removed when both players disconnect to prevent memory leaks
