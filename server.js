const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

// Game state management
const games = new Map(); // gameCode -> gameState
const players = new Map(); // socketId -> playerInfo

// Briscola game logic
const SUITS = ['Clubs', 'Hearts', 'Diamonds', 'Spades'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K'];
const CARD_POINTS = {
  'A': 11, '3': 10, 'K': 4, 'Q': 3, 'J': 2,
  '2': 0, '4': 0, '5': 0, '6': 0, '7': 0
};

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({
        suit, value, points: CARD_POINTS[value],
        id: `${suit}-${value}`
      });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function dealCards(deck, numPlayers) {
  const hands = Array(numPlayers).fill(null).map(() => []);
  const cardsPerPlayer = 3;
  
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let player = 0; player < numPlayers; player++) {
      hands[player].push(deck.pop());
    }
  }
  return hands;
}

function getCardRank(value) {
  const ranks = {
    'Asso': 11, 'Tre': 10, 'Re': 4, 'Cavallo': 3, 'Fante': 2,
    'Sette': 1, 'Sei': 0, 'Cinque': 0, 'Quattro': 0, 'Due': 0
  };
  return ranks[value];
}

function getWinningCard(cards, trumpSuit) {
  const firstCard = cards[0];
  const firstSuit = firstCard.suit;
  
  const trumpCards = cards.filter(card => card.suit === trumpSuit);
  if (trumpCards.length > 0) {
    return trumpCards.reduce((highest, current) => {
      const currentRank = getCardRank(current.value);
      const highestRank = getCardRank(highest.value);
      return currentRank > highestRank ? current : highest;
    });
  }
  
  const sameSuitCards = cards.filter(card => card.suit === firstSuit);
  return sameSuitCards.reduce((highest, current) => {
    const currentRank = getCardRank(current.value);
    const highestRank = getCardRank(highest.value);
    return currentRank > highestRank ? current : highest;
  });
}

function calculateTeamPoints(cards) {
  return cards.reduce((total, card) => total + card.points, 0);
}

// Game state structure
const createGameState = (gameCode, hostSocketId, gameMode) => ({
  gameCode,
  hostSocketId,
  gameMode,
  players: new Map(),
  gameStarted: false,
  gameState: null,
  createdAt: Date.now()
});

// Initialize game state when game starts
function initializeGameState(gameState) {
  console.log('Initializing game state for game with players:', gameState.players.size);
  const numPlayers = gameState.players.size;
  const deck = shuffleDeck(createDeck());
  const trumpCard = deck.pop();
  const trumpSuit = trumpCard.suit;
  const hands = dealCards(deck, numPlayers);
  
  const gameStateData = {
    deck,
    trumpCard,
    trumpSuit,
    hands,
    currentTrick: [],
    playedCards: [],
    scores: Array(numPlayers).fill(0),
    teamScores: [0, 0],
    trickWinner: null,
    gamePhase: 'playing',
    currentPlayer: 0,
    playerNames: {},
    teams: {},
    gameMode: gameState.gameMode
  };
  
  console.log('Game state created:', {
    deckLength: gameStateData.deck.length,
    trumpSuit: gameStateData.trumpSuit,
    handsLength: gameStateData.hands.length,
    scores: gameStateData.scores
  });
  
  return gameStateData;
}

// Player info structure
const createPlayerInfo = (socketId, playerName, gameCode, isHost = false) => ({
  socketId,
  playerName,
  gameCode,
  isHost,
  playerId: null, // Will be assigned when game starts
  joinedAt: Date.now()
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create new game
  socket.on('createGame', (data) => {
    const { playerName, gameMode, gameCode } = data;
    
    // Create game state
    const gameState = createGameState(gameCode, socket.id, gameMode);
    games.set(gameCode, gameState);
    
    // Create player info
    const playerInfo = createPlayerInfo(socket.id, playerName, gameCode, true);
    players.set(socket.id, playerInfo);
    gameState.players.set(socket.id, playerInfo);
    
    // Join room
    socket.join(gameCode);
    
    console.log(`Game created: ${gameCode} by ${playerName}`);
    
    socket.emit('gameCreated', {
      gameCode,
      gameMode,
      isHost: true,
      playerName
    });
  });

  // Join existing game
  socket.on('joinGame', (data) => {
    console.log('Server received joinGame event:', data);
    const { playerName, gameCode } = data;
    
    const gameState = games.get(gameCode);
    if (!gameState) {
      console.log(`Game ${gameCode} not found`);
      socket.emit('joinError', { message: 'Game not found' });
      return;
    }
    
    if (gameState.gameStarted) {
      console.log(`Game ${gameCode} already started`);
      socket.emit('joinError', { message: 'Game already started' });
      return;
    }
    
    // Create player info
    const playerInfo = createPlayerInfo(socket.id, playerName, gameCode, false);
    players.set(socket.id, playerInfo);
    gameState.players.set(socket.id, playerInfo);
    
    // Join room
    socket.join(gameCode);
    
    console.log(`Player ${playerName} joined game ${gameCode}`);
    
    // Notify all players in the room
    const playerJoinedData = {
      playerName,
      playerCount: gameState.players.size,
      players: Array.from(gameState.players.values()).map(p => ({
        name: p.playerName,
        isHost: p.isHost
      }))
    };
    console.log('Sending playerJoined event:', playerJoinedData);
    io.to(gameCode).emit('playerJoined', playerJoinedData);
    
    // Auto-start logic based on game mode
    const requiredPlayers = gameState.gameMode === 'teams' ? 4 : 2;
    console.log(`Game ${gameCode} mode: ${gameState.gameMode}, players: ${gameState.players.size}, required: ${requiredPlayers}`);
    
    // For 2-player games: auto-start when 2 players join
    // For 4-player games: wait for all 4 players, then allow host to start
    if (gameState.gameMode === 'individual' && gameState.players.size >= 2 && !gameState.gameStarted) {
      console.log(`Auto-starting 2-player game ${gameCode} with ${gameState.players.size} players`);
      
      // Mark game as started
      gameState.gameStarted = true;
      
      // Assign player IDs
      const playerArray = Array.from(gameState.players.values());
      playerArray.forEach((player, index) => {
        player.playerId = index;
      });
      
      // Initialize game state
      console.log('Creating game state...');
      gameState.gameState = initializeGameState(gameState);
      console.log('Game state created and assigned:', !!gameState.gameState);
      
      // Set player names in game state
      if (gameState.gameState) {
        playerArray.forEach((player, index) => {
          gameState.gameState.playerNames[index] = player.playerName;
        });
      }
      
      console.log(`Game ${gameCode} auto-started with ${gameState.players.size} players`);
      console.log('Game state initialized:', JSON.stringify(gameState.gameState, null, 2));
      console.log('Game state exists:', !!gameState.gameState);
      console.log('Game state deck length:', gameState.gameState?.deck?.length);
      
      // Notify all players with full game state
      const gameStartedData = {
        gameCode,
        players: playerArray.map(p => ({
          socketId: p.socketId,
          playerName: p.playerName,
          playerId: p.playerId,
          isHost: p.isHost
        })),
        gameState: gameState.gameState
      };
      
      console.log('Sending auto-started gameStarted event to all players in room:', gameCode);
      console.log('Game started data being sent:', {
        hasGameState: !!gameStartedData.gameState,
        gameStateKeys: gameStartedData.gameState ? Object.keys(gameStartedData.gameState) : 'NO GAME STATE',
        playersCount: gameStartedData.players.length
      });
      
      io.to(gameCode).emit('gameStarted', gameStartedData);
      
      // Send individually to each player
      playerArray.forEach((player, index) => {
        setTimeout(() => {
          console.log(`Sending auto-started gameStarted to player ${index}: ${player.playerName} (${player.socketId})`);
          console.log(`Game state for player ${index}:`, !!gameStartedData.gameState);
          io.to(player.socketId).emit('gameStarted', gameStartedData);
        }, index * 100);
      });
    } else if (gameState.gameMode === 'teams' && gameState.players.size === 4) {
      // For 4-player games: notify that all players have joined and host can start
      console.log(`All 4 players joined game ${gameCode}, waiting for host to start`);
      
      // Send event to notify that game is ready to start
      io.to(gameCode).emit('gameReadyToStart', {
        gameCode,
        players: Array.from(gameState.players.values()).map(p => ({
          name: p.playerName,
          isHost: p.isHost
        })),
        canStart: true
      });
    }
    
    const gameJoinedData = {
      gameCode,
      gameMode: gameState.gameMode,
      isHost: false,
      playerName,
      players: Array.from(gameState.players.values()).map(p => ({
        name: p.playerName,
        isHost: p.isHost
      }))
    };
    console.log('Sending gameJoined event:', gameJoinedData);
    socket.emit('gameJoined', gameJoinedData);
  });

  // Start game
  socket.on('startGame', (data) => {
    console.log('Server received startGame event:', data);
    const { gameCode } = data;
    const gameState = games.get(gameCode);
    const playerInfo = players.get(socket.id);
    
    console.log('Game state found:', !!gameState);
    console.log('Player info found:', !!playerInfo);
    console.log('Player is host:', playerInfo?.isHost);
    console.log('Player count:', gameState?.players?.size);
    
    if (!gameState || !playerInfo) {
      console.log('Game not found or player not found');
      socket.emit('startError', { message: 'Game not found' });
      return;
    }
    
    if (!playerInfo.isHost) {
      console.log('Player is not host');
      socket.emit('startError', { message: 'Only host can start the game' });
      return;
    }
    
    if (gameState.players.size < 2) {
      console.log('Not enough players:', gameState.players.size);
      socket.emit('startError', { message: 'Need at least 2 players' });
      return;
    }
    
    // Mark game as started
    gameState.gameStarted = true;
    
    // Assign player IDs
    const playerArray = Array.from(gameState.players.values());
    playerArray.forEach((player, index) => {
      player.playerId = index;
    });
    
    // Initialize game state
    gameState.gameState = initializeGameState(gameState);
    
    // Set player names in game state
    playerArray.forEach((player, index) => {
      gameState.gameState.playerNames[index] = player.playerName;
    });
    
    console.log(`Game ${gameCode} started with ${gameState.players.size} players`);
    console.log('Game state initialized:', JSON.stringify(gameState.gameState, null, 2));
    
    // Notify all players with full game state
    const gameStartedData = {
      gameCode,
      players: playerArray.map(p => ({
        socketId: p.socketId,
        playerName: p.playerName,
        playerId: p.playerId,
        isHost: p.isHost
      })),
      gameState: gameState.gameState
    };
    
    console.log('Sending gameStarted event to all players in room:', gameCode);
    console.log('Game started data:', JSON.stringify(gameStartedData, null, 2));
    
    // Send to room first
    io.to(gameCode).emit('gameStarted', gameStartedData);
    
    // Then send individually to each player with a small delay
    playerArray.forEach((player, index) => {
      setTimeout(() => {
        console.log(`Sending individual gameStarted to player ${index}: ${player.playerName} (${player.socketId})`);
        io.to(player.socketId).emit('gameStarted', gameStartedData);
      }, index * 100); // 100ms delay between each player
    });
  });

  // Request current game state
  socket.on('requestGameState', (data) => {
    const { gameCode } = data;
    const gameState = games.get(gameCode);
    
    if (!gameState || !gameState.gameState) {
      socket.emit('gameStateError', { message: 'Game not found or not started' });
      return;
    }
    
    console.log(`Sending game state to ${socket.id} for game ${gameCode}`);
    socket.emit('gameStateUpdate', {
      gameState: gameState.gameState
    });
  });

  // Game move
  socket.on('gameMove', (data) => {
    const { gameCode, move, args } = data;
    const gameState = games.get(gameCode);
    const playerInfo = players.get(socket.id);
    
    if (!gameState || !playerInfo || !gameState.gameState) {
      socket.emit('moveError', { message: 'Game not found or not started' });
      return;
    }
    
    const game = gameState.gameState;
    const playerId = playerInfo.playerId;
    
    // Validate move
    if (game.currentPlayer !== playerId) {
      socket.emit('moveError', { message: 'Not your turn' });
      return;
    }
    
    // Handle different moves
    if (move === 'playCard') {
      const [cardIndex] = args;
      const playerHand = game.hands[playerId];
      
      if (cardIndex < 0 || cardIndex >= playerHand.length) {
        socket.emit('moveError', { message: 'Invalid card index' });
        return;
      }
      
      // Check if player has no cards to play (game should end)
      if (playerHand.length === 0) {
        console.log(`Player ${playerId} has no cards to play, ending game`);
        game.gamePhase = 'finished';
        
        // Broadcast game over
        io.to(gameCode).emit('gameStateUpdate', {
          gameState: game,
          lastMove: { playerId, move, args }
        });
        return;
      }
      
      if (game.currentTrick.length >= gameState.players.size) {
        socket.emit('moveError', { message: 'Trick already complete' });
        return;
      }
      
      // Play the card
      console.log(`Player ${playerId} playing card ${cardIndex}, hand length before:`, playerHand.length);
      const playedCard = playerHand.splice(cardIndex, 1)[0];
      console.log(`Player ${playerId} played card:`, playedCard);
      console.log(`Player ${playerId} hand length after play:`, playerHand.length);
      
      game.currentTrick.push({
        ...playedCard,
        player: playerId
      });
      game.playedCards.push(playedCard);
      
      // Draw a new card immediately after playing (if deck has cards)
      if (game.deck.length > 0) {
        const newCard = game.deck.pop();
        game.hands[playerId].push(newCard);
        console.log(`Player ${playerId} drew card:`, newCard);
        console.log(`Player ${playerId} hand length after draw:`, game.hands[playerId].length);
        console.log(`Deck length after draw:`, game.deck.length);
      } else {
        console.log(`No cards in deck to draw for player ${playerId}`);
      }
      
      // Force ensure all players have 3 cards if deck has cards
      for (let i = 0; i < game.hands.length; i++) {
        while (game.hands[i].length < 3 && game.deck.length > 0) {
          const extraCard = game.deck.pop();
          game.hands[i].push(extraCard);
          console.log(`Force drew extra card for player ${i}:`, extraCard);
        }
      }
      
      // Special case: if deck is empty and only 1 card left (trump card), 
      // the last player should get it
      if (game.deck.length === 1 && game.hands.every(hand => hand.length < 3)) {
        const lastCard = game.deck.pop();
        // Give the last card to the current player
        game.hands[playerId].push(lastCard);
        console.log(`Last card (trump) given to player ${playerId}:`, lastCard);
      }
      
      // If this completes a trick, determine winner and update scores
      if (game.currentTrick.length === gameState.players.size) {
        // First, broadcast the current state so everyone can see the last card played
        console.log('Trick completed, showing cards before scoring...');
        io.to(gameCode).emit('gameStateUpdate', {
          gameState: game,
          lastMove: {
            playerId,
            move,
            args
          },
          trickComplete: true // Flag to indicate trick is complete but scores not yet updated
        });
        
        // Add delay before processing the trick completion
        setTimeout(() => {
          const winningCard = getWinningCard(game.currentTrick, game.trumpSuit);
          const winningPlayer = game.currentTrick.find(card => 
            card.suit === winningCard.suit && card.value === winningCard.value
          ).player;
          
          game.trickWinner = winningPlayer;
          const trickPoints = calculateTeamPoints(game.currentTrick);
          game.scores[winningPlayer] += trickPoints;
          
          // Update team scores for 4-player mode
          if (game.gameMode === 'teams' && game.teams[winningPlayer]) {
            const team = game.teams[winningPlayer];
            const teamIndex = team === 'team1' ? 0 : 1;
            game.teamScores[teamIndex] += trickPoints;
          }
          
          // Clear current trick
          game.currentTrick = [];
          
          // Check if game is over
          const totalCardsPlayed = game.playedCards.length;
          const totalCards = 40; // 40 cards in a Briscola deck
          
          // Game ends when all cards are played (including the trump card)
          if (totalCardsPlayed >= totalCards) {
            game.gamePhase = 'finished';
            console.log('Game finished! All cards played:', totalCardsPlayed);
          }
          
          // Also check if deck is empty and no more cards to draw
          if (game.deck.length === 0 && game.hands.every(hand => hand.length === 0)) {
            game.gamePhase = 'finished';
            console.log('Game finished! Deck empty and no cards in hands');
          }
          
          // Check if any player has no cards left (game should end)
          if (game.hands.some(hand => hand.length === 0)) {
            game.gamePhase = 'finished';
            console.log('Game finished! At least one player has no cards left');
          }
          
          // Next player leads
          game.currentPlayer = winningPlayer;
          
          // Broadcast the final state with updated scores
          console.log('Broadcasting final trick completion with updated scores');
          io.to(gameCode).emit('gameStateUpdate', {
            gameState: game,
            lastMove: {
              playerId,
              move,
              args
            },
            trickComplete: false // Flag to indicate scores are now updated
          });
        }, 2000); // 2 second delay
        
        return; // Don't broadcast immediately, wait for timeout
      } else {
        // Next player's turn
        game.currentPlayer = (game.currentPlayer + 1) % gameState.players.size;
      }
    }
    
    // Broadcast updated game state to all players (only for non-trick-complete moves)
    if (game.currentTrick.length !== gameState.players.size) {
      console.log('Broadcasting game state update to game', gameCode);
      console.log('Game state hands:', game.hands);
      console.log('Game state deck length:', game.deck.length);
      
      io.to(gameCode).emit('gameStateUpdate', {
        gameState: game,
        lastMove: {
          playerId,
          move,
          args
        }
      });
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    const playerInfo = players.get(socket.id);
    if (playerInfo) {
      const gameState = games.get(playerInfo.gameCode);
      if (gameState) {
        gameState.players.delete(socket.id);
        
        // If host disconnected, assign new host
        if (playerInfo.isHost && gameState.players.size > 0) {
          const newHost = Array.from(gameState.players.values())[0];
          newHost.isHost = true;
          
          io.to(playerInfo.gameCode).emit('hostChanged', {
            newHost: newHost.playerName
          });
        }
        
        // If no players left, delete game
        if (gameState.players.size === 0) {
          games.delete(playerInfo.gameCode);
          console.log(`Game ${playerInfo.gameCode} deleted - no players left`);
        } else {
          // Notify remaining players
          io.to(playerInfo.gameCode).emit('playerLeft', {
            playerName: playerInfo.playerName,
            playerCount: gameState.players.size
          });
        }
      }
      
      players.delete(socket.id);
    }
  });
});

// API endpoints
app.get('/api/games/:gameCode', (req, res) => {
  const { gameCode } = req.params;
  const gameState = games.get(gameCode);
  
  console.log(`API request for game ${gameCode}:`, {
    gameExists: !!gameState,
    gameStarted: gameState?.gameStarted,
    playerCount: gameState?.players?.size,
    hasGameState: !!gameState?.gameState
  });
  
  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  // If game is started but has no game state, force initialize it
  if (gameState.gameStarted && !gameState.gameState) {
    console.log('Game is started but has no game state, force initializing...');
    
    // Assign player IDs
    const playerArray = Array.from(gameState.players.values());
    playerArray.forEach((player, index) => {
      player.playerId = index;
    });
    
    // Initialize game state
    gameState.gameState = initializeGameState(gameState);
    
    // Set player names
    playerArray.forEach((player, index) => {
      gameState.gameState.playerNames[index] = player.playerName;
    });
    
    console.log('Force initialized game state:', !!gameState.gameState);
  }
  
  const response = {
    gameCode,
    gameMode: gameState.gameMode,
    gameStarted: gameState.gameStarted,
    playerCount: gameState.players.size,
    players: Array.from(gameState.players.values()).map(p => ({
      name: p.playerName,
      isHost: p.isHost
    })),
    gameState: gameState.gameState
  };
  
  console.log('API response for game', gameCode, ':', {
    hasGameState: !!response.gameState,
    gameStarted: response.gameStarted,
    playerCount: response.playerCount
  });
  
  res.json(response);
});

// Debug endpoint to see all games
app.get('/api/debug/games', (req, res) => {
  const allGames = Array.from(games.entries()).map(([code, game]) => ({
    gameCode: code,
    gameMode: game.gameMode,
    gameStarted: game.gameStarted,
    playerCount: game.players.size,
    players: Array.from(game.players.values()).map(p => ({
      name: p.playerName,
      isHost: p.isHost
    })),
    hasGameState: !!game.gameState
  }));
  
  res.json({
    totalGames: games.size,
    games: allGames
  });
});

// Force start a game
app.post('/api/games/:gameCode/start', (req, res) => {
  const { gameCode } = req.params;
  const gameState = games.get(gameCode);
  
  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  if (gameState.gameStarted) {
    return res.json({ message: 'Game already started', gameState: gameState.gameState });
  }
  
  if (gameState.players.size < 2) {
    return res.status(400).json({ error: 'Need at least 2 players' });
  }
  
  // Force start the game
  gameState.gameStarted = true;
  
  // Assign player IDs
  const playerArray = Array.from(gameState.players.values());
  playerArray.forEach((player, index) => {
    player.playerId = index;
  });
  
  // Initialize game state
  gameState.gameState = initializeGameState(gameState);
  
  // Set player names
  playerArray.forEach((player, index) => {
    gameState.gameState.playerNames[index] = player.playerName;
  });
  
  console.log(`Force started game ${gameCode} with game state:`, !!gameState.gameState);
  
  res.json({
    message: 'Game force started',
    gameState: gameState.gameState
  });
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
