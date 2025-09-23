# Briscola Card Game

A multiplayer Briscola card game built with React and boardgame.io, following the same structure as the Tic-Tac-Toe tutorial.

## Features

- **2-4 Player Support**: Play with 2, 3, or 4 players
- **AI Bot Support**: Play against computer opponents
- **Authentic Briscola Rules**: Traditional Italian card game mechanics
- **Real-time Gameplay**: Turn-based card playing with automatic scoring
- **Visual Card Display**: Beautiful card interface with suit symbols and point values

## How to Play Briscola

Briscola is a trick-taking card game where players try to win tricks by playing higher-value cards.

### Card Values
- **Asso (Ace)**: 11 points
- **Tre (Three)**: 10 points  
- **Re (King)**: 4 points
- **Cavallo (Queen)**: 3 points
- **Fante (Jack)**: 2 points
- **All other cards**: 0 points

### Game Rules
1. Each player starts with 3 cards
2. A trump suit is determined by revealing the top card of the deck
3. Players take turns playing one card per trick
4. The highest trump card wins, or the highest card of the first suit played
5. The winner of each trick collects the points and leads the next trick
6. Players draw new cards after each trick (if deck has cards)
7. Game ends when all cards are played
8. Player with the most points wins

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server and client:
```bash
npm run dev
```

This will start:
- Server on [http://localhost:3001](http://localhost:3001)
- Client on [http://localhost:3000](http://localhost:3000)

### Alternative: Run separately

1. Start the server:
```bash
npm run server
```

2. In another terminal, start the client:
```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000) to view the game

### Playing the Game

1. **2-Player Mode**: Default setup for head-to-head play
2. **4-Player Mode**: Change `numPlayers: 4` in `src/App.js`
3. **AI Mode**: Use the debug panel to simulate AI moves
4. **Reset Game**: Use the reset button in the debug panel

### Debug Panel

The debug panel (visible when `debug: true`) allows you to:
- See game state and player hands
- Simulate AI moves
- Reset the game
- Step through moves manually

## Game Structure

- `src/Game.js` - Core game logic and rules
- `src/Board.js` - React components for game display
- `src/App.js` - Main application setup
- `src/index.js` - React entry point

## Customization

### Adding More Players
Change the `numPlayers` value in `src/App.js`:
```javascript
const App = Client({
  game: Briscola,
  board: BriscolaBoard,
  numPlayers: 4, // 2, 3, or 4 players
  debug: true,
});
```

### Modifying AI Behavior
The AI uses Monte Carlo Tree Search (MCTS) by default. You can customize the AI in the `ai` section of `src/Game.js`.

### Styling
Modify the card styles and layout in `src/Board.js` to customize the appearance.

## Technical Details

- Built with React 18 and boardgame.io
- Uses ES2015+ features (modules, arrow functions, destructuring)
- Responsive design with CSS-in-JS styling
- State management handled by boardgame.io framework

## Troubleshooting

- If cards don't display properly, check that all dependencies are installed
- For AI issues, ensure the debug panel is enabled
- Game state is automatically managed by boardgame.io

Enjoy playing Briscola! 🃏
