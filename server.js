const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
function normalizeName(name) { return (name || '').trim().toLowerCase(); }

// Ensure a proper Map for players when loading from persisted JSON
function ensurePlayersMapFromPersistent(gameCode, gameState) {
  if (!gameState) return;
  const looksLikeMap = gameState.players && typeof gameState.players.values === 'function';
  if (looksLikeMap) return;
  const persistentData = persistentGames.get(gameCode);
  const roster = persistentData?.registeredPlayers || gameState.registeredPlayers || [];
  const playersArr = persistentData?.players || [];
  const identities = Array.isArray(roster) && roster.length > 0
    ? roster.map(r => ({
        playerName: r.playerName,
        playerId: r.playerId ?? null,
        isHost: !!r.isHost,
        lastKnownSocketId: r.lastKnownSocketId || null
      }))
    : (Array.isArray(playersArr) ? playersArr.map(p => ({
        playerName: p.playerName,
        playerId: p.playerId ?? null,
        isHost: !!p.isHost,
        lastKnownSocketId: p.socketId || null
      })) : []);
  const map = new Map();
  identities.forEach(id => {
    const tempSocketId = id.lastKnownSocketId || `temp_${Date.now()}_${Math.random()}`;
    map.set(tempSocketId, {
      playerName: id.playerName,
      playerId: id.playerId,
      isHost: id.isHost,
      socketId: tempSocketId,
      gameCode
    });
  });
  gameState.players = map;
}

// Ensure every rostered player exists in the runtime players Map
function ensureAllRosterPlayersPresent(gameCode, gameState) {
  if (!gameState) return;
  if (!Array.isArray(gameState.registeredPlayers)) return;
  if (!gameState.players || typeof gameState.players.set !== 'function') {
    gameState.players = new Map();
  }
  const existing = new Set(Array.from(gameState.players.values()).map(p => normalizeName(p.playerName)));
  gameState.registeredPlayers.forEach(r => {
    const n = normalizeName(r.playerName);
    if (!existing.has(n)) {
      const tempSocketId = r.lastKnownSocketId || `temp_${Date.now()}_${Math.random()}`;
      gameState.players.set(tempSocketId, {
        playerName: r.playerName,
        playerId: r.playerId ?? null,
        isHost: !!r.isHost,
        socketId: tempSocketId,
        gameCode
      });
      existing.add(n);
    }
  });
}

function getPlayersListForClient(gameState) {
  const liveList = Array.from(gameState?.players?.values?.() || []);
  if (Array.isArray(gameState?.registeredPlayers) && gameState.registeredPlayers.length > 0) {
    const byName = new Map(liveList.map(p => [normalizeName(p.playerName), p]));
    return gameState.registeredPlayers.map(r => {
      const live = byName.get(normalizeName(r.playerName));
      return {
        playerName: r.playerName,
        playerId: (r.playerId ?? (live?.playerId ?? null)),
        isHost: !!r.isHost,
        socketId: live?.socketId || r.lastKnownSocketId || null
      };
    });
  }
  return liveList;
}

function updateRosterLastKnownSocket(gameState, playerName, socketId) {
  if (!Array.isArray(gameState?.registeredPlayers)) return;
  const idx = gameState.registeredPlayers.findIndex(r => normalizeName(r.playerName) === normalizeName(playerName));
  if (idx >= 0) {
    gameState.registeredPlayers[idx].lastKnownSocketId = socketId;
  }
}

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

// User-to-game mapping for single game per user
const userGames = new Map(); // normalized playerName -> gameCode

// Persistent game storage (in production, use a database)
const persistentGames = new Map(); // gameCode -> persistentGameData
const PERSISTENT_STORAGE_FILE = process.env.PERSISTENT_STORAGE_FILE || 'persistent_games.json';

// Load persistent games from file on startup
function loadPersistentGamesFromFile() {
  try {
    if (fs.existsSync(PERSISTENT_STORAGE_FILE)) {
      const data = fs.readFileSync(PERSISTENT_STORAGE_FILE, 'utf8');
      const games = JSON.parse(data);
      Object.entries(games).forEach(([gameCode, gameData]) => {
        persistentGames.set(gameCode, gameData);
      });
      console.log(`Loaded ${persistentGames.size} persistent games from file`);
    }
  } catch (error) {
    console.error('Error loading persistent games:', error);
  }
}

// Save persistent games to file
function savePersistentGamesToFile() {
  try {
    const games = Object.fromEntries(persistentGames);
    fs.writeFileSync(PERSISTENT_STORAGE_FILE, JSON.stringify(games, null, 2));
    console.log(`Saved ${persistentGames.size} persistent games to file`);
  } catch (error) {
    console.error('Error saving persistent games:', error);
  }
}

// Load persistent games on startup
loadPersistentGamesFromFile();

// Save game state persistently
function saveGameState(gameCode, gameState) {
  const persistentData = {
    gameCode,
    gameState,
    lastUpdated: Date.now(),
    players: Array.from(gameState.players.values()),
    registeredPlayers: gameState.registeredPlayers || [],
    // Store complete game state including gameState.gameState
    completeGameState: gameState.gameState
  };
  persistentGames.set(gameCode, persistentData);
  
  // Also save to file
  savePersistentGamesToFile();
  
  console.log(`Saved persistent game state for ${gameCode} with complete game data`);
}

// Load game state from persistent storage
function loadGameState(gameCode) {
  const persistentData = persistentGames.get(gameCode);
  if (persistentData) {
    console.log(`Loaded persistent game state for ${gameCode}`);
    return persistentData;
  }
  return null;
}

// Clean up finished game
function cleanupFinishedGame(gameCode) {
  console.log(`Cleaning up finished game: ${gameCode}`);
  
  // Get game state to clean up user mappings
  const gameState = games.get(gameCode);
  if (gameState) {
    // Remove user mappings for all players
    Array.from(gameState.players.values()).forEach(player => {
      userGames.delete(player.playerName);
      console.log(`Removed user mapping for ${player.playerName}`);
    });
  }
  
  // Remove from active games
  games.delete(gameCode);
  
  // Remove from persistent storage
  persistentGames.delete(gameCode);
  
  // Save to file after cleanup
  savePersistentGamesToFile();
  
  console.log(`Game ${gameCode} completely cleaned up`);
}

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
  // Briscola trick order (highest to lowest): A, 3, K, Q, J, 7, 6, 5, 4, 2
  // Use standard letters from our deck values
  const ranks = {
    'A': 9,
    '3': 8,
    'K': 7,
    'Q': 6,
    'J': 5,
    '7': 4,
    '6': 3,
    '5': 2,
    '4': 1,
    '2': 0
  };
  return ranks[value] ?? -1;
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
  // Keep a roster of all registered players by stable identity (playerName)
  registeredPlayers: [], // [{ playerName, playerId, lastKnownSocketId, isHost }]
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
    gameMode: gameState.gameMode,
    // Track if the face-up trump card has been taken
    trumpTaken: false
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
  console.log(`Connection from: ${socket.handshake.address}`);
  console.log(`User-Agent: ${socket.handshake.headers['user-agent']}`);

  // Create new game
  socket.on('createGame', (data) => {
    const { playerName, gameMode, gameCode } = data;
    
    // Check if user already has a game
    const existingGameCode = userGames.get(normalizeName(playerName));
    if (existingGameCode) {
      console.log(`User ${playerName} already has a game: ${existingGameCode}`);
      // Clean up old game if it exists
      if (games.has(existingGameCode)) {
        games.delete(existingGameCode);
      }
      if (persistentGames.has(existingGameCode)) {
        persistentGames.delete(existingGameCode);
      }
    }
    
    // Create game state
    const gameState = createGameState(gameCode, socket.id, gameMode);
    games.set(gameCode, gameState);
    
    // Map user to game
    userGames.set(normalizeName(playerName), gameCode);
    
    // Create player info
    const playerInfo = createPlayerInfo(socket.id, playerName, gameCode, true);
    players.set(socket.id, playerInfo);
    gameState.players.set(socket.id, playerInfo);
  // Update roster
  gameState.registeredPlayers = [
    { playerName, playerId: 0, lastKnownSocketId: socket.id, isHost: true }
  ];
    
    // Join room
    socket.join(gameCode);
    
    // Save to persistent storage
    saveGameState(gameCode, gameState);
    
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
    
    // Check if user already has a different game; if so, override/cleanup previous mapping
    const normalizedName = normalizeName(playerName);
    const userCurrentGame = userGames.get(normalizedName);
    if (userCurrentGame && userCurrentGame !== gameCode) {
      console.log(`Overriding previous game for ${playerName}: ${userCurrentGame} -> ${gameCode}`);
      // Remove player from active previous game
      const prevActive = games.get(userCurrentGame);
      if (prevActive) {
        // Remove from players Map by name
        for (const [sid, p] of Array.from(prevActive.players.entries())) {
          if (normalizeName(p.playerName) === normalizedName) {
            prevActive.players.delete(sid);
          }
        }
        // Remove from roster
        prevActive.registeredPlayers = (prevActive.registeredPlayers || []).filter(r => normalizeName(r.playerName) !== normalizedName);
        saveGameState(userCurrentGame, prevActive);
        if (prevActive.players.size === 0) {
          games.delete(userCurrentGame);
          console.log(`Previous game ${userCurrentGame} had no players left and was removed from active games`);
        }
      }
      // Remove from persistent previous game
      const prevPersist = persistentGames.get(userCurrentGame);
      if (prevPersist) {
        prevPersist.players = (prevPersist.players || []).filter(p => normalizeName(p.playerName) !== normalizedName);
        prevPersist.registeredPlayers = (prevPersist.registeredPlayers || []).filter(r => normalizeName(r.playerName) !== normalizedName);
        persistentGames.set(userCurrentGame, prevPersist);
        savePersistentGamesToFile();
      }
      // Update mapping to new game
      userGames.set(normalizedName, gameCode);
    }
    
    let gameState = games.get(gameCode);
    
    // If not in active games, check persistent games
    if (!gameState) {
      console.log(`Game ${gameCode} not in active games, checking persistent storage...`);
      const persistentData = persistentGames.get(gameCode);
      if (persistentData) {
        console.log(`Found game ${gameCode} in persistent storage, restoring...`);
        console.log(`Persistent data players:`, persistentData.players);
        // Restore game to active games
        const restoredGameState = persistentData.gameState;
        
        // Convert players array back to Map and recreate roster
        restoredGameState.players = new Map();
        const persistedPlayers = (persistentData.players && Array.isArray(persistentData.players)) ? persistentData.players : [];
        const persistedRoster = (persistentData.registeredPlayers && Array.isArray(persistentData.registeredPlayers)) ? persistentData.registeredPlayers : [];

        // Prefer roster for canonical identities; fall back to players array
        const identities = persistedRoster.length > 0 ? persistedRoster.map(r => ({
          playerName: r.playerName,
          playerId: r.playerId ?? null,
          isHost: !!r.isHost,
          lastKnownSocketId: r.lastKnownSocketId || null
        })) : persistedPlayers.map(p => ({
          playerName: p.playerName,
          playerId: p.playerId ?? null,
          isHost: !!p.isHost,
          lastKnownSocketId: p.socketId || null
        }));

        restoredGameState.registeredPlayers = identities;

        identities.forEach(id => {
          // Reinsert as offline participants with temp socketIds; they will swap on reconnect
          const tempSocketId = id.lastKnownSocketId || `temp_${Date.now()}_${Math.random()}`;
          const playerObj = {
            playerName: id.playerName,
            playerId: id.playerId,
            isHost: id.isHost,
            socketId: tempSocketId,
            gameCode
          };
          restoredGameState.players.set(tempSocketId, playerObj);
          userGames.set(normalizeName(id.playerName), gameCode);
          console.log(`Restored roster player ${id.playerName} with temp socketId ${tempSocketId}`);
        });
        console.log(`Restored ${restoredGameState.players.size} players to active game`);
        
        // Restore complete game state if available
        if (persistentData.completeGameState) {
          restoredGameState.gameState = persistentData.completeGameState;
          console.log(`Restored complete game state for ${gameCode}`);
        }
        
        // Ensure full roster present in players map
        ensureAllRosterPlayersPresent(gameCode, restoredGameState);
        games.set(gameCode, restoredGameState);
        gameState = restoredGameState;
        console.log(`Game ${gameCode} restored from persistent storage with ${gameState.players.size} players`);
      }
    }
    
    if (!gameState) {
      console.log(`Game ${gameCode} not found in active or persistent storage`);
      socket.emit('joinError', { message: 'Game not found' });
      return;
    }
    
    // Check if player already exists in game (by name)
    console.log(`Checking for existing player ${playerName} in game ${gameCode}`);
    console.log(`Current players in game:`, Array.from(gameState.players.values()).map(p => ({ name: p.playerName, socketId: p.socketId })));
    
    let existingPlayer = Array.from(gameState.players.values()).find(p => p.playerName === playerName);
    
    // If not found in active game, check persistent storage
    if (!existingPlayer) {
      console.log(`Player ${playerName} not found in active game, checking persistent storage...`);
      const persistentData = persistentGames.get(gameCode);
      if (persistentData && persistentData.players) {
        console.log(`Persistent storage players:`, persistentData.players.map(p => ({ name: p.playerName, socketId: p.socketId })));
        const persistentPlayer = persistentData.players.find(p => p.playerName === playerName);
        if (persistentPlayer) {
          console.log(`Found player ${playerName} in persistent storage, adding to active game...`);
          // Add player back to active game
          persistentPlayer.socketId = socket.id; // Update socketId
          gameState.players.set(socket.id, persistentPlayer);
          existingPlayer = persistentPlayer;
          
          // Update user mapping
          userGames.set(normalizeName(playerName), gameCode);
          
          // Update persistent storage with new socketId
          const updatedPersistentData = { ...persistentData };
          updatedPersistentData.players = updatedPersistentData.players.map(p => 
            p.playerName === playerName ? { ...p, socketId: socket.id } : p
          );
          persistentGames.set(gameCode, updatedPersistentData);
        } else {
          console.log(`Player ${playerName} not found in persistent storage players:`, persistentData.players.map(p => p.playerName));
        }
      } else {
        console.log(`No persistent data found for game ${gameCode}`);
      }
    }
    
    if (existingPlayer) {
      console.log(`Found existing player ${playerName} with socketId ${existingPlayer.socketId}, updating to ${socket.id}`);
      // Update socketId for existing player
      gameState.players.delete(existingPlayer.socketId);
      existingPlayer.socketId = socket.id;
      gameState.players.set(socket.id, existingPlayer);
      players.set(socket.id, existingPlayer);
      updateRosterLastKnownSocket(gameState, playerName, socket.id);
      
      // Join room
      socket.join(gameCode);
      
      console.log(`Player ${playerName} reconnected to game ${gameCode}`);
      
      // If game is started, send the current game state
      if (gameState.gameStarted && gameState.gameState) {
        console.log(`Sending gameStarted event to reconnected player ${playerName}`);
        socket.emit('gameStarted', {
          gameState: gameState.gameState,
          players: getPlayersListForClient(gameState)
        });
      } else {
        console.log(`Sending joinSuccess event to reconnected player ${playerName}`);
        // Emit success for lobby
        socket.emit('joinSuccess', {
          gameCode: gameCode,
          gameMode: gameState.gameMode,
          players: getPlayersListForClient(gameState)
        });
      }
      
      return;
    } else {
      console.log(`Player ${playerName} not found in existing players`);
    }
    
    // If game already started, allow rejoin if player is in registered roster
    if (gameState.gameStarted) {
      const normalizedName = normalizeName(playerName);
      const roster = gameState.registeredPlayers || [];
      const rosterEntry = roster.find(r => normalizeName(r.playerName) === normalizedName);
      if (rosterEntry) {
        console.log(`Allowing roster-based rejoin for ${playerName} into started game ${gameCode}`);
        const playerInfo = {
          playerName,
          socketId: socket.id,
          gameCode,
          isHost: !!rosterEntry.isHost,
          playerId: rosterEntry.playerId ?? null,
          joinedAt: Date.now()
        };
        players.set(socket.id, playerInfo);
        gameState.players.set(socket.id, playerInfo);
        updateRosterLastKnownSocket(gameState, playerName, socket.id);
        socket.join(gameCode);
        // Emit current state depending on availability
        if (gameState.gameState) {
          socket.emit('gameStarted', {
            gameState: gameState.gameState,
            players: getPlayersListForClient(gameState)
          });
        } else {
          socket.emit('joinSuccess', {
            gameCode: gameCode,
            gameMode: gameState.gameMode,
            players: getPlayersListForClient(gameState)
          });
        }
        return;
      }
      console.log(`Game ${gameCode} already started and player ${playerName} not in roster`);
      socket.emit('joinError', { message: 'Game already started' });
      return;
    }
    
    // Create new player info
    const playerInfo = createPlayerInfo(socket.id, playerName, gameCode, false);
    players.set(socket.id, playerInfo);
    gameState.players.set(socket.id, playerInfo);
  // Update roster if not present
  if (!gameState.registeredPlayers.find(p => p.playerName === playerName)) {
    const nextId = gameState.registeredPlayers.length;
    gameState.registeredPlayers.push({
      playerName,
      playerId: nextId,
      lastKnownSocketId: socket.id,
      isHost: false
    });
  }
    
    // Update user mapping
    userGames.set(normalizeName(playerName), gameCode);
  // Persist immediately so offline discovery works for both players
  saveGameState(gameCode, gameState);
    
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
    
    // For 4-player team games, validate team selection
    if (gameState.players.size === 4 && gameState.gameMode === 'teams') {
      const playerList = Array.from(gameState.players.values());
      const allPlayersHaveTeams = playerList.every(p => p.team);
      
      if (!allPlayersHaveTeams) {
        console.log('Not all players have selected teams');
        socket.emit('startError', { message: 'All players must select teams before starting' });
        return;
      }
      
      // Validate team balance (2 players per team)
      const team1Count = playerList.filter(p => p.team === 'team1').length;
      const team2Count = playerList.filter(p => p.team === 'team2').length;
      
      if (team1Count !== 2 || team2Count !== 2) {
        console.log('Teams not balanced:', { team1Count, team2Count });
        socket.emit('startError', { message: 'Teams must be balanced (2 players per team)' });
        return;
      }
    }
    
    // Mark game as started
    gameState.gameStarted = true;
    
    // Save complete game state to persistent storage immediately
    saveGameState(gameCode, gameState);
    console.log(`Game ${gameCode} started and saved to persistent storage`);
    
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
    
    // Set team assignments in game state for team games
    if (gameState.gameMode === 'teams') {
      playerArray.forEach((player, index) => {
        if (player.team) {
          gameState.gameState.teams[index] = player.team;
        }
      });
      console.log('Team assignments set:', gameState.gameState.teams);
    }
    
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

  // Team selection for 4-player games
  socket.on('selectTeam', (data) => {
    const { gameCode, team } = data;
    const gameState = games.get(gameCode);
    const playerInfo = players.get(socket.id);
    
    if (!gameState || !playerInfo) {
      socket.emit('teamSelectionError', { message: 'Game not found or player not found' });
      return;
    }
    
    if (gameState.gameMode !== 'teams') {
      socket.emit('teamSelectionError', { message: 'Team selection only available for team games' });
      return;
    }
    
    // Update player team
    playerInfo.team = team;
    
    // Update game state teams if game state exists
    if (gameState.gameState) {
      const playerId = playerInfo.playerId;
      gameState.gameState.teams[playerId] = team;
    }
    
    console.log(`Player ${playerInfo.playerName} selected team ${team}`);
    console.log('Updated player info:', playerInfo);
    
    // Broadcast updated player list to all players
    const playerList = Array.from(gameState.players.values());
    console.log('Broadcasting updated player list:', playerList.map(p => ({ name: p.playerName, team: p.team })));
    
    io.to(gameCode).emit('playerJoined', {
      players: playerList,
      playerCount: playerList.length
    });
    
    // Check if all players have selected teams
    const allPlayersHaveTeams = playerList.every(p => p.team);
    if (allPlayersHaveTeams) {
      console.log('All players have selected teams, game ready to start');
      io.to(gameCode).emit('gameReadyToStart', {
        message: 'All players have selected teams'
      });
    }
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
      
      // Do not prematurely end the game here; finalization happens after all 40 cards are played
      
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
      
      // Defer drawing cards until the trick is complete and a winner is known
      
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
          
          console.log(`Trick completed: Player ${winningPlayer} won ${trickPoints} points`);
          console.log(`Game mode: ${game.gameMode}, Teams:`, game.teams);
          console.log(`Current team scores before update:`, game.teamScores);
          
          // Update team scores for 4-player mode
          if (game.gameMode === 'teams' && game.teams[winningPlayer]) {
            const team = game.teams[winningPlayer];
            const teamIndex = team === 'team1' ? 0 : 1;
            game.teamScores[teamIndex] += trickPoints;
            console.log(`Team score updated: Player ${winningPlayer} (${team}) won ${trickPoints} points. Team scores:`, game.teamScores);
          } else {
            console.log(`Team score not updated: gameMode=${game.gameMode}, teams=${JSON.stringify(game.teams)}, winningPlayer=${winningPlayer}`);
          }
          
          // Clear current trick
          game.currentTrick = [];

          // After scoring, deal cards in order starting from trick winner
          // Standard Briscola dealing:
          // - Winner draws first from the face-down stock (game.deck)
          // - Continue clockwise until each player has drawn once
          // - When the stock runs out, the face-up trump card is taken by the next player in order (exactly once)
          const numPlayers = gameState.players.size;
          for (let offset = 0; offset < numPlayers; offset++) {
            const pid = (winningPlayer + offset) % numPlayers;
            if (game.deck.length > 0) {
              const drawn = game.deck.pop();
              game.hands[pid].push(drawn);
              console.log(`Post-trick draw: Player ${pid} drew`, drawn);
            } else if (!game.trumpTaken) {
              game.hands[pid].push(game.trumpCard);
              game.trumpTaken = true;
              console.log(`Trump dealt to player ${pid}:`, game.trumpCard);
            }
          }
          
          // Check if game is over only after resolving trick
          const totalCardsPlayed = game.playedCards.length;
          const totalCards = 40; // 40 cards in a Briscola deck
          if (totalCardsPlayed >= totalCards) {
            game.gamePhase = 'finished';
            console.log('Game finished! All cards played:', totalCardsPlayed);
            // No cleanup here immediately; let clients render Game Over first. Cleanup can be triggered externally.
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
    
    // Always save game state persistently after every move
    saveGameState(gameCode, gameState);
    
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
        // Check if this is the last player BEFORE deleting
        const isLastPlayer = gameState.players.size === 1;
        
        // If this is the last player, save game state before deleting
        if (isLastPlayer && gameState.gameState) {
          console.log(`Last player disconnecting, saving game state with all players...`);
          saveGameState(playerInfo.gameCode, gameState);
        }
        
        gameState.players.delete(socket.id);
        
        // If host disconnected, assign new host
        if (playerInfo.isHost && gameState.players.size > 0) {
          const newHost = Array.from(gameState.players.values())[0];
          newHost.isHost = true;
          
          io.to(playerInfo.gameCode).emit('hostChanged', {
            newHost: newHost.playerName
          });
        }
        
        // If no players left, move to persistent storage
        if (gameState.players.size === 0) {
          // Save game state to persistent storage before removing from active games
          if (gameState.gameState) {
            saveGameState(playerInfo.gameCode, gameState);
            console.log(`Game ${playerInfo.gameCode} saved to persistent storage before removal`);
          }
          games.delete(playerInfo.gameCode);
          console.log(`Game ${playerInfo.gameCode} moved to persistent storage - no active players`);
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
// Get user's current game
app.get('/api/user/:playerName/game', (req, res) => {
  const { playerName } = req.params;
  let gameCode = userGames.get(normalizeName(playerName));
  let gameState = null;

  // Try mapping first
  if (gameCode) {
    gameState = games.get(gameCode) || persistentGames.get(gameCode)?.gameState || null;
  }

  // If no mapping or missing game, scan active and persistent by roster/name
  if (!gameState) {
    // Scan active games
    for (const [code, gs] of games.entries()) {
      const inRoster = Array.isArray(gs.registeredPlayers) && gs.registeredPlayers.some(r => r.playerName === playerName);
      const inPlayers = Array.from(gs.players.values()).some(p => p.playerName === playerName);
      if (inRoster || inPlayers) {
        gameCode = code;
        gameState = gs;
        userGames.set(normalizeName(playerName), code);
        break;
      }
    }
  }

  if (!gameState) {
    // Scan persistent games
    for (const [code, data] of persistentGames.entries()) {
      const gs = data.gameState;
      ensurePlayersMapFromPersistent(code, gs);
      const roster = data.registeredPlayers || gs.registeredPlayers || [];
      const playersArr = data.players || [];
      const inRoster = Array.isArray(roster) && roster.some(r => r.playerName === playerName);
      const inPlayers = Array.isArray(playersArr) && playersArr.some(p => p.playerName === playerName);
      if (inRoster || inPlayers) {
        gameCode = code;
        gameState = gs;
        userGames.set(normalizeName(playerName), code);
        break;
      }
    }
  }

  if (!gameState) {
    return res.json({ gameCode: null, message: 'No active game found' });
  }

  res.json({
    gameCode,
    gameStarted: gameState.gameStarted,
    players: Array.from(gameState.players.values()).map(p => ({
      name: p.playerName,
      socketId: p.socketId,
      playerId: p.playerId
    }))
  });
});

app.get('/api/games/:gameCode', (req, res) => {
  const { gameCode } = req.params;
  const gameState = games.get(gameCode);
  ensurePlayersMapFromPersistent(gameCode, gameState);
  
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

// Check for user's active games
app.get('/api/user/:socketId/games', (req, res) => {
  const { socketId } = req.params;
  const userGames = [];
  
  // Check persistent games for this user
  for (const [gameCode, persistentData] of persistentGames.entries()) {
    const player = persistentData.players.find(p => p.socketId === socketId);
    if (player) {
      userGames.push({
        gameCode,
        playerName: player.playerName,
        gameState: persistentData.gameState,
        lastUpdated: persistentData.lastUpdated
      });
    }
  }
  
  res.json({ games: userGames });
});

// Check for user's active games by player name
app.get('/api/user/name/:playerName/games', (req, res) => {
  const { playerName } = req.params;
  const userGames = [];
  
  console.log(`Checking games for playerName: ${playerName}`);
  console.log(`Persistent games count: ${persistentGames.size}`);
  
  // Check persistent games for this user by name
  for (const [gameCode, persistentData] of persistentGames.entries()) {
    console.log(`Checking game ${gameCode}:`, persistentData);
    const player = persistentData.players.find(p => p.playerName === playerName);
    if (player) {
      console.log(`Found player ${player.playerName} in game ${gameCode}`);
      userGames.push({
        gameCode,
        playerName: player.playerName,
        gameState: persistentData.gameState,
        lastUpdated: persistentData.lastUpdated
      });
    }
  }
  
  console.log(`Returning ${userGames.length} games for player ${playerName}`);
  res.json({ games: userGames });
});

// Restore game from persistent storage
app.post('/api/games/:gameCode/restore', (req, res) => {
  const { gameCode } = req.params;
  const { socketId } = req.body;
  
  const persistentData = loadGameState(gameCode);
  if (!persistentData) {
    return res.status(404).json({ error: 'Game not found in persistent storage' });
  }
  
  // Check if user was part of this game
  const player = persistentData.players.find(p => p.socketId === socketId);
  if (!player) {
    return res.status(403).json({ error: 'User not part of this game' });
  }
  
  // Restore game to active games
  games.set(gameCode, persistentData.gameState);
  console.log(`Game ${gameCode} restored from persistent storage`);
  
  res.json({
    success: true,
    gameState: persistentData.gameState,
    players: persistentData.players
  });
});

// Make offline move
app.post('/api/games/:gameCode/move', (req, res) => {
  const { gameCode } = req.params;
  const { socketId, playerId, move, args } = req.body;
  
  console.log(`Offline move request for game ${gameCode}: Player ${playerId} making move ${move}`);
  
  // Get game from persistent storage or active games
  let gameState = games.get(gameCode);
  if (!gameState) {
    const persistentData = loadGameState(gameCode);
    if (!persistentData) {
      return res.status(404).json({ error: 'Game not found' });
    }
    gameState = persistentData.gameState;
    
    // Restore complete game state
    if (persistentData.completeGameState) {
      gameState.gameState = persistentData.completeGameState;
      console.log(`Restored complete game state for offline move in game ${gameCode}`);
    }
  }
  
  // Resolve player by playerId from players map or registered roster
  let player = Array.from(gameState.players.values()).find(p => p.playerId === Number(playerId));
  if (!player && Array.isArray(gameState.registeredPlayers)) {
    const reg = gameState.registeredPlayers.find(r => r.playerId === Number(playerId));
    if (reg) {
      // Recreate a lightweight player entry for making the move
      const tempId = socketId || reg.lastKnownSocketId || `temp_${Date.now()}_${Math.random()}`;
      player = {
        playerName: reg.playerName,
        playerId: reg.playerId,
        isHost: !!reg.isHost,
        socketId: tempId,
        gameCode
      };
      gameState.players.set(tempId, player);
    }
  }
  if (!player) {
    return res.status(403).json({ error: 'User not authorized for this move' });
  }
  
  try {
    // Make the move using the game logic
    const game = gameState.gameState;
    if (!game) {
      return res.status(400).json({ error: 'Game not started' });
    }
    
    // Apply the move
    game.move(game, { playerID: playerId, move, args });
    
    // Save the updated game state
    saveGameState(gameCode, gameState);
    
    // If game is not active, restore it temporarily
    if (!games.has(gameCode)) {
      games.set(gameCode, gameState);
    }
    
    console.log(`Offline move made: Player ${playerId} made move ${move} in game ${gameCode}`);
    
    res.json({
      success: true,
      gameState: game,
      message: 'Move saved successfully'
    });
  } catch (error) {
    console.error('Error making offline move:', error);
    res.status(400).json({ error: error.message || 'Invalid move' });
  }
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
    activeGames: allGames,
    persistentGames: Array.from(persistentGames.entries()).map(([code, data]) => ({
      gameCode: code,
      lastUpdated: data.lastUpdated,
      players: data.players.map(p => ({
        name: p.playerName,
        socketId: p.socketId
      }))
    })),
    userMappings: Array.from(userGames.entries()).map(([name, gameCode]) => ({
      playerName: name,
      gameCode: gameCode
    }))
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

// Debug endpoint to check specific game
app.get('/api/debug/game/:gameCode', (req, res) => {
  const { gameCode } = req.params;
  
  const activeGame = games.get(gameCode);
  const persistentData = persistentGames.get(gameCode);
  
  res.json({
    gameCode,
    activeGame: activeGame ? {
      gameStarted: activeGame.gameStarted,
      players: Array.from(activeGame.players.values()).map(p => ({
        name: p.playerName,
        socketId: p.socketId,
        playerId: p.playerId
      }))
    } : null,
    persistentGame: persistentData ? {
      lastUpdated: persistentData.lastUpdated,
      players: persistentData.players.map(p => ({
        name: p.playerName,
        socketId: p.socketId
      }))
    } : null
  });
});

// Network test endpoint
app.get('/api/network-test', (req, res) => {
  res.json({
    status: 'success',
    message: 'Server is reachable',
    timestamp: new Date().toISOString(),
    clientIP: req.ip,
    userAgent: req.get('User-Agent')
  });
});

// Manual cleanup endpoint for testing
app.post('/api/debug/cleanup/:gameCode', (req, res) => {
  const { gameCode } = req.params;
  
  const gameState = games.get(gameCode);
  if (gameState) {
    // Save to persistent storage
    saveGameState(gameCode, gameState);
    // Remove from active games
    games.delete(gameCode);
    console.log(`Manually moved game ${gameCode} to persistent storage`);
    
    res.json({
      success: true,
      message: `Game ${gameCode} moved to persistent storage`
    });
  } else {
    res.status(404).json({ error: 'Game not found in active games' });
  }
});

// Force move all games to persistent storage
app.post('/api/debug/move-all-to-persistent', (req, res) => {
  const movedGames = [];
  
  for (const [gameCode, gameState] of games.entries()) {
    saveGameState(gameCode, gameState);
    games.delete(gameCode);
    movedGames.push(gameCode);
  }
  
  res.json({
    success: true,
    message: `Moved ${movedGames.length} games to persistent storage`,
    games: movedGames
  });
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all network interfaces

// Get local IP address for network access
const os = require('os');
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://${localIP}:${PORT}`);
  console.log(`Mobile devices should use: http://${localIP}:${PORT}`);
});
