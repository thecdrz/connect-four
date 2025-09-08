# Grace's Games - Multiplayer Ga- 🎪 **Horror CPU Collection:** 10 iconic horror characters as CPU opponents - Freddy, Michael, Jason, Frankenstein, Dracula, The Exorcist, Creature, Chainsaw, The Mummy, and The Nun.e Platform

A real-time, browser-based multiplayer gaming platform featuring **Connect 4** and **Checkers** built with Node.js and Socket.IO. This project features clean user interfaces, real-time chat (with typing indicator), character avatars, invite links, rematches, and a persistent leaderboard.

**🚀 Live Demo: [cdrz.app](https://cdrz.app)**

## Games Available

### 🔴 Connect 4
Classic Connect 4 gameplay with modern multiplayer features.

### 🏁 Checkers  
Full-featured checkers implementation with:
- **Standard Rules**: Move diagonally on dark squares, capture by jumping
- **King Promotion**: Pieces become kings when reaching the opposite end
- **Double Jumps**: Continue capturing in the same turn when possible
- **Visual Feedback**: Green highlights for possible moves, red for captures (works perfectly in multiplayer!)
- **Smart CPU AI**: Prioritizes captures and strategic positioning
- **Audio Cues**: Sound effects for piece selection, moves, and captures

## Features

- 🎮 **Real-time Multiplayer:** Private online games with low-latency moves via Socket.IO for both Connect 4 and Checkers.
- 🎯 **Multi-Game Platform:** Seamlessly switch between Connect 4 and Checkers with dynamic board switching and game-specific UI.
- 🗂️ **Live Lobby:** Auto‑updating list of active games with host/opponent status and join availability.
- 👀 **Spectator Mode:** Watch any in‑progress game in real time (read‑only chat, live board & turn status).
- 🚪 **Stop Watching:** Instantly exit a spectated game; board clears and lobby actions return.
- 🆔 **Prominent Room Code + Invite Links:** Copy the room code or a full auto-join link (includes optional host name).
- 🔗 **One‑Click Sharing:** Copy Link & Copy Code buttons surface immediately after creating/joining a game.
- 💬 **In-Game Chat:** Real-time messaging plus a subtle **typing indicator** for better conversational flow.
- 🧑‍🤝‍🧑 **Character Avatars:** Illustrated player tokens with active-turn glow (accessibility-friendly highlight).
- 🧠 **CPU Mode:** Single-player with 3 difficulty levels for Connect 4 - Easy (random), Medium (strategic), Hard (minimax AI). Intelligent CPU for Checkers with capture prioritization.
- � **Horror CPU Collection:** 9 iconic horror characters as CPU opponents - Freddy, Michael, Jason, Frankenstein, Dracula, The Exorcist, Creature, Chainsaw, and The Mummy.
- �🎯 **Adaptive AI:** CPU difficulties scale from beginner-friendly random moves to expert-level minimax algorithm with alpha-beta pruning.
- 🔄 **Rematch Flow:** Post-game rematch button with vote sync (starts when both players agree).
- � **Persistent Leaderboard:** Tracks wins, games played, and win rate across sessions.
- 🗂️ **Name Persistence:** Recently used player name auto-fills when opening an invite link.
    - Note: The invite link includes both `room` and a `host` param. The `host` value is displayed contextually ("Joining <host>'s game") but does not overwrite Player 2's own chosen name.
- 🛡️ **Integrity Guards:** A single browser tab cannot join/create a second game or self‑occupy both seats; spectators cannot trigger player actions.
- 🧭 **Adaptive Sidebar Layout:** Dynamic height algorithm prevents chat/lobby from extending below the board on desktop.
- 🎨 **Modern & Responsive UI:** Board + chat stay side-by-side on desktop; adaptive stacking for tablets & mobile.
- ✨ **Polished Feedback:** Animated piece drops, winning pulse, hover micro‑interactions, active avatar glow, piece selection highlighting.
- 🔊 **Rich Audio:** Game-specific sound effects including piece drops, moves, captures, and selection feedback with toggle control.
- 🎨 **Dynamic Branding:** Logo switches based on selected game (Grace for Checkers, Connect 4 logo for Connect 4).
- 🛠️ **Straightforward Deployment:** No build step; deploy directly to Render / any Node host.

## How to Play

### Getting Started
1. **Choose Your Game**: Select either **Connect 4** or **Checkers** using the game type buttons.
2. **Start a Game**: Click **New Online Game** (or play vs CPU with the CPU button).
3. **Invite a Friend**: Use Copy Link (auto-join deep link) or Copy Code from the status panel.
4. **They Join**: Your friend opens the link (room + host pre-filled) or clicks Join Online Game and enters the code.

### Connect 4 Rules
- **Goal**: First to connect four pieces horizontally, vertically, or diagonally wins.
- **Gameplay**: Turns alternate. Drop pieces into columns.

### Checkers Rules  
- **Goal**: Capture all opponent pieces or block all their moves.
- **Movement**: Move diagonally on dark squares only.
- **Capturing**: Jump diagonally over opponent pieces to capture them.
- **Kings**: Pieces reaching the opposite end become kings (can move in all directions).
- **Double Jumps**: If you can capture again after a jump, you must continue.
- **Visual Aids**: Green squares show possible moves, red squares show capture opportunities.

5. **Chat & Play**: Use the chat to communicate during gameplay.
6. **Rematch**: After Game Over both players can request a rematch—starts automatically once both vote.

> Tip: The active player's avatar glows. The room code lives in the status panel above the chat so it's easy to copy and share.

## Visuals

### Screenshot

![Game Screenshot](assets/ScreenshotDemo.png)

> Shows desktop layout with board, chat, avatars, invite controls, and status panel.

## Tech Stack

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
-   **Backend**: Node.js, Express
-   **Real-time Communication**: Socket.IO
-   **Hosting**: Deployed on [Render](https://render.com)

## Running Locally

### Prerequisites
-   Node.js (v16 or higher recommended)
-   npm (included with Node.js)

### Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/thecdrz/connect-four.git
    cd connect-four
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the server:**
    ```bash
    npm start
    ```

4.  **Open in your browser:**
    -   Navigate to `http://localhost:3000`.
    -   Open a second browser tab or window to simulate a second player.

## Deployment

This application is configured for easy deployment on platforms like **Render**.

When deploying, ensure the host uses the `PORT` environment variable. The `server.js` is already configured to use `process.env.PORT`.

-   **Build Command**: `npm install`
-   **Start Command**: `npm start`

## Project Structure

```
/
├── public/             # Static assets (if any)
├── css/style.css       # All styling and animations
├── js/game.js          # Client-side game logic and Socket.IO handling
├── index.html          # Main HTML file for the game interface
├── server.js           # Node.js server with Express and Socket.IO
├── package.json        # Project dependencies and scripts
└── README.md           # This file
```

## Architecture Overview

Room-based real-time model with an in-memory lobby & spectator layer:

- **Authoritative server state** per game (players, spectators, board, recent chat slice).
- **Lobby projection** broadcast (`lobby:update`) on create/join/leave/finish/remove.
- **Spectators** receive a snapshot (`spectatorJoined`) and neutral game over messaging (no rematch button).
- **Guards** prevent double-joining or self-occupying both player slots; spectators blocked from player-only actions.
- **Adaptive layout** logic keeps chat + lobby bounded to board height.

### Socket Events
Client → Server: `createGame`, `joinGame`, `leaveGame`, `makeMove`, `requestRematch`, `sendChatMessage`, `typing`, `lobby:subscribe`, `lobby:unsubscribe`, `spectateGame`, `stopSpectating`.

Server → Client: `gameCreated`, `gameJoined`, `gameStart`, `playersUpdated`, `moveMade`, `gameWon`, `gameDraw`, `playerDisconnected`, `rematchVote`, `rematchStarted`, `chatMessage`, `typing`, `lobby:update`, `spectatorJoined`, `spectateEnded`, `error`.

Notes:
- Lobby update payloads are intentionally small (no boards) for efficiency.
- Spectator chat is read-only; history trimmed to recent messages.
- Rematch button only rendered for active players.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

**Enjoy the game! 🎉**

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

### Upcoming (Backlog / Ideas)
- Transition polish on dynamic height changes & lobby row updates.
- Dark / high-contrast + colorblind accessibility theme.
- Emoji reactions / lightweight emote bar.
- Optional QR code generator for invite link.
- Configurable CPU difficulty levels.

---

