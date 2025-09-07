# Connect 4 - Online Multiplayer Game

A real-time multiplayer Connect 4 game that can be played in the browser over the internet using WebSockets.

## Features

- 🎮 Real-time multiplayer gameplay
- 🌐 Play with friends over the internet
- 🎨 Beautiful, responsive design
- 🚀 Easy to set up and deploy
- 📱 Mobile-friendly interface
- 🏆 Win detection with animated highlights
- 🔄 Automatic game state synchronization

## How to Play

1. **Start a Game**: Click "New Game" to create a room and share the Room ID with a friend
2. **Join a Game**: Click "Join Game" and enter the Room ID provided by your friend
3. **Make Moves**: Click on any column to drop your piece (red for Player 1, yellow for Player 2)
4. **Win Condition**: Connect 4 pieces horizontally, vertically, or diagonally to win!

## Installation & Setup

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Running Locally

1. **Clone/Download the project**
   ```bash
   cd connect4-game
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   - Go to `http://localhost:3000`
   - Open multiple browser windows or share the URL with friends to play together

## Project Structure

```
connect4-game/
├── index.html          # Main HTML file with game interface
├── css/
│   └── style.css      # Game styling and animations
├── js/
│   └── game.js        # Client-side game logic and Socket.io handling
├── server.js          # Node.js server with Socket.io for multiplayer
├── package.json       # Project dependencies and scripts
└── README.md         # This file
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.io
- **Game Logic**: Custom Connect 4 implementation with win detection

## Game Logic Features

- ✅ Standard 6x7 Connect 4 board
- ✅ Turn-based gameplay
- ✅ Win detection (horizontal, vertical, diagonal)
- ✅ Draw detection when board is full
- ✅ Player disconnection handling
- ✅ Real-time game state synchronization
- ✅ Room-based multiplayer system

## Deployment

This game can be easily deployed to platforms like:
- Heroku
- Railway
- DigitalOcean
- AWS
- Vercel (for serverless deployment)

Make sure to set the appropriate PORT environment variable for production deployments.

## License

MIT License - feel free to use this project for learning or building your own games!

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests
- Improve documentation

---

**Enjoy playing Connect 4 with your friends! 🎉**
