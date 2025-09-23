import { INVALID_MOVE } from 'boardgame.io/core';

// Briscola card suits and values
const SUITS = ['Bastoni', 'Coppe', 'Denari', 'Spade'];
const VALUES = ['Asso', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Fante', 'Cavallo', 'Re'];

// Card point values in Briscola
const CARD_POINTS = {
  'Asso': 11,
  'Tre': 10,
  'Re': 4,
  'Cavallo': 3,
  'Fante': 2,
  'Due': 0,
  'Quattro': 0,
  'Cinque': 0,
  'Sei': 0,
  'Sette': 0
};

// Create a full deck of Briscola cards
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({
        suit,
        value,
        points: CARD_POINTS[value],
        id: `${suit}-${value}`
      });
    }
  }
  return deck;
}

// Shuffle deck using Fisher-Yates algorithm
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Deal cards to players
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

// Determine which card wins a trick
function getWinningCard(cards, trumpSuit) {
  const firstCard = cards[0];
  const firstSuit = firstCard.suit;
  
  // Find the highest card of the trump suit
  const trumpCards = cards.filter(card => card.suit === trumpSuit);
  if (trumpCards.length > 0) {
    return trumpCards.reduce((highest, current) => {
      const currentRank = getCardRank(current.value);
      const highestRank = getCardRank(highest.value);
      return currentRank > highestRank ? current : highest;
    });
  }
  
  // If no trump cards, find highest card of the first suit
  const sameSuitCards = cards.filter(card => card.suit === firstSuit);
  return sameSuitCards.reduce((highest, current) => {
    const currentRank = getCardRank(current.value);
    const highestRank = getCardRank(highest.value);
    return currentRank > highestRank ? current : highest;
  });
}

// Get card rank for comparison (higher number = higher rank)
function getCardRank(value) {
  const ranks = {
    'Asso': 11,
    'Tre': 10,
    'Re': 4,
    'Cavallo': 3,
    'Fante': 2,
    'Sette': 1,
    'Sei': 0,
    'Cinque': 0,
    'Quattro': 0,
    'Due': 0
  };
  return ranks[value];
}

// Calculate total points for a team
function calculateTeamPoints(cards) {
  return cards.reduce((total, card) => total + card.points, 0);
}

export const Briscola = {
  setup: (ctx) => {
    const deck = shuffleDeck(createDeck());
    const trumpCard = deck.pop(); // Reveal trump card
    const trumpSuit = trumpCard.suit;
    const hands = dealCards(deck, ctx.numPlayers);
    
    return {
      deck,
      trumpCard,
      trumpSuit,
      hands,
      currentTrick: [],
      playedCards: [],
      scores: Array(ctx.numPlayers).fill(0),
      teamScores: [0, 0], // For 4-player team mode
      trickWinner: null,
      gamePhase: 'playing', // 'playing' or 'finished'
      gameCode: null,
      playerNames: {},
      teams: {}, // For 4-player mode: {0: 'team1', 1: 'team1', 2: 'team2', 3: 'team2'}
      gameMode: ctx.numPlayers === 4 ? 'teams' : 'individual'
    };
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  moves: {
    playCard: ({ G, ctx, playerID }, cardIndex) => {
      const playerHand = G.hands[playerID];
      
      // Validate move
      if (cardIndex < 0 || cardIndex >= playerHand.length) {
        return INVALID_MOVE;
      }
      
      if (G.currentTrick.length >= ctx.numPlayers) {
        return INVALID_MOVE;
      }
      
      // Play the card
      const playedCard = playerHand.splice(cardIndex, 1)[0];
      G.currentTrick.push({
        ...playedCard,
        player: playerID
      });
      G.playedCards.push(playedCard);
      
      // If this completes a trick, determine winner and update scores
      if (G.currentTrick.length === ctx.numPlayers) {
        const winningCard = getWinningCard(G.currentTrick, G.trumpSuit);
        const winningPlayer = G.currentTrick.find(card => 
          card.suit === winningCard.suit && card.value === winningCard.value
        ).player;
        
        G.trickWinner = winningPlayer;
        const trickPoints = calculateTeamPoints(G.currentTrick);
        G.scores[winningPlayer] += trickPoints;
        
        // Update team scores for 4-player mode
        if (G.gameMode === 'teams' && G.teams[winningPlayer]) {
          const team = G.teams[winningPlayer];
          const teamIndex = team === 'team1' ? 0 : 1;
          G.teamScores[teamIndex] += trickPoints;
        }
        
        // Clear current trick
        G.currentTrick = [];
        
        // Check if game is over
        const totalCardsPlayed = G.playedCards.length;
        const totalCards = 40; // 40 cards in a Briscola deck
        if (totalCardsPlayed >= totalCards) {
          G.gamePhase = 'finished';
        }
      }
    },

    drawCard: ({ G, ctx, playerID }) => {
      // Draw a new card if deck has cards and player has less than 3 cards
      if (G.deck.length > 0 && G.hands[playerID].length < 3) {
        const newCard = G.deck.pop();
        G.hands[playerID].push(newCard);
      }
    },

    setPlayerName: ({ G, playerID }, name) => {
      G.playerNames[playerID] = name;
    },

    setGameCode: ({ G }, code) => {
      G.gameCode = code;
    },

    selectTeam: ({ G, playerID }, team) => {
      if (G.gameMode === 'teams') {
        G.teams[playerID] = team;
      }
    }
  },

  endIf: ({ G, ctx }) => {
    if (G.gamePhase === 'finished') {
      // Determine winner based on total points
      const maxScore = Math.max(...G.scores);
      const winners = G.scores.map((score, index) => 
        score === maxScore ? index : null
      ).filter(index => index !== null);
      
      if (winners.length === 1) {
        return { winner: winners[0] };
      } else {
        return { draw: true };
      }
    }
  },

  ai: {
    enumerate: (G, ctx) => {
      const moves = [];
      const playerHand = G.hands[ctx.currentPlayer];
      
      // Enumerate all possible card plays
      for (let i = 0; i < playerHand.length; i++) {
        moves.push({ move: 'playCard', args: [i] });
      }
      
      return moves;
    },
  },
};
