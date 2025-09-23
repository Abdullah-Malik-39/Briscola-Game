import React from 'react';

// Map Briscola suits to standard playing card suits
const SUIT_MAPPING = {
  'Bastoni': 'Clubs',
  'Coppe': 'Hearts', 
  'Denari': 'Diamonds',
  'Spade': 'Spades'
};

// Map Briscola values to standard playing card values
const VALUE_MAPPING = {
  'Asso': 'A',
  'Due': '2',
  'Tre': '3',
  'Quattro': '4',
  'Cinque': '5',
  'Sei': '6',
  'Sette': '7',
  'Fante': 'J',
  'Cavallo': 'Q',
  'Re': 'K'
};

function Card({ card, onClick, isPlayable = false, isPlayed = false, isHidden = false }) {
  const getCardImage = (card) => {
    if (isHidden) {
      return '/cards/cardBack.png';
    }
    
    const suit = SUIT_MAPPING[card.suit];
    const value = VALUE_MAPPING[card.value];
    return `/cards/card${suit}${value}.png`;
  };

  const cardStyle = {
    width: window.innerWidth < 768 ? '50px' : '60px',
    height: window.innerWidth < 768 ? '75px' : '90px',
    border: '2px solid #333',
    borderRadius: '6px',
    margin: '2px',
    cursor: isPlayable ? 'pointer' : 'default',
    backgroundImage: `url(${getCardImage(card)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    boxShadow: isPlayable ? '0 4px 8px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
    transform: isPlayable ? 'scale(1.1)' : 'scale(1)',
    transition: 'all 0.2s ease',
    position: 'relative',
    flexShrink: 0
  };

  return (
    <div 
      style={cardStyle} 
      onClick={isPlayable ? () => onClick() : undefined}
    >
      {!isHidden && (
        <div style={{
          position: 'absolute',
          bottom: '2px',
          right: '2px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          padding: '2px 4px',
          borderRadius: '3px',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#333'
        }}>
          {card.points > 0 && `+${card.points}`}
        </div>
      )}
    </div>
  );
}

function PlayerHand({ hand, onCardClick, currentPlayer, playerID, isCurrentPlayer, playerName, isOwnHand = false }) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      minHeight: '140px',
      backgroundColor: isCurrentPlayer ? '#e3f2fd' : '#f5f5f5',
      padding: '10px',
      borderRadius: '8px',
      margin: '5px',
      border: isCurrentPlayer ? '2px solid #2196F3' : '1px solid #ddd'
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
        {hand.map((card, index) => (
          <Card
            key={`${card.id}-${index}`}
            card={card}
            onClick={() => onCardClick(index)}
            isPlayable={isCurrentPlayer}
            isHidden={!isOwnHand}
          />
        ))}
      </div>
      <div style={{ 
        position: 'absolute', 
        top: '5px', 
        left: '10px',
        fontSize: '14px',
        fontWeight: 'bold',
        color: isCurrentPlayer ? '#2196F3' : '#666'
      }}>
        {playerName || `Player ${playerID}`} {isCurrentPlayer ? '(Your Turn)' : ''}
      </div>
    </div>
  );
}

function DeckDisplay({ deck, trumpCard, trumpSuit }) {
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      margin: '20px 0'
    }}>
      {/* Deck pile */}
      <div style={{
        position: 'relative',
        width: '80px',
        height: '120px',
        marginRight: '20px'
      }}>
        {/* Deck background */}
        <div style={{
          width: '80px',
          height: '120px',
          backgroundImage: 'url(/cards/cardBack.png)',
          backgroundSize: 'cover',
          borderRadius: '8px',
          border: '2px solid #333',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        }} />
        
        {/* Trump card sticking out */}
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          width: '80px',
          height: '120px',
          backgroundImage: `url(/cards/card${SUIT_MAPPING[trumpCard.suit]}${VALUE_MAPPING[trumpCard.value]}.png)`,
          backgroundSize: 'cover',
          borderRadius: '8px',
          border: '2px solid #ff6b35',
          boxShadow: '0 6px 12px rgba(0,0,0,0.4)',
          transform: 'rotate(15deg)',
          zIndex: 2
        }} />
      </div>
      
      {/* Deck info */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: '10px',
        borderRadius: '8px',
        textAlign: 'center',
        minWidth: '150px'
      }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>
          Cards Left: {deck.length}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Trump: {trumpSuit}
        </div>
      </div>
    </div>
  );
}

function CurrentTrick({ trick, trumpSuit }) {
  if (trick.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '20px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
        margin: '10px 0'
      }}>
        <p>Waiting for cards to be played...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '20px',
      backgroundColor: '#fff3e0',
      borderRadius: '8px',
      margin: '10px 0'
    }}>
      <h3>Current Trick</h3>
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
        {trick.map((card, index) => (
          <Card
            key={`trick-${card.id}-${index}`}
            card={card}
            isPlayed={true}
          />
        ))}
      </div>
    </div>
  );
}

function GameInfo({ ctx, G }) {
  const gameOver = ctx.gameover;
  
  return (
    <div style={{ 
      backgroundColor: '#f0f0f0', 
      padding: '15px', 
      borderRadius: '8px',
      margin: '10px 0'
    }}>
      <h3>Game Status</h3>
      <p><strong>Current Player:</strong> Player {ctx.currentPlayer}</p>
      <p><strong>Trump Card:</strong> {G.trumpCard.value} of {G.trumpCard.suit}</p>
      <p><strong>Trump Suit:</strong> {G.trumpSuit}</p>
      
      <div style={{ marginTop: '10px' }}>
        <h4>Scores:</h4>
        {G.scores.map((score, index) => (
          <p key={index} style={{ margin: '2px 0' }}>
            Player {index}: {score} points
          </p>
        ))}
      </div>
      
      {gameOver && (
        <div style={{ 
          backgroundColor: gameOver.winner !== undefined ? '#c8e6c9' : '#ffecb3',
          padding: '10px',
          borderRadius: '4px',
          marginTop: '10px'
        }}>
          {gameOver.winner !== undefined ? (
            <h3>🎉 Player {gameOver.winner} wins! 🎉</h3>
          ) : (
            <h3>🤝 It's a draw! 🤝</h3>
          )}
        </div>
      )}
    </div>
  );
}

export function BriscolaBoard({ ctx, G, moves, events, playerID }) {
  const currentPlayer = ctx.currentPlayer;
  const isCurrentPlayer = (checkPlayerID) => checkPlayerID === currentPlayer;
  const isOwnHand = (checkPlayerID) => checkPlayerID === playerID;
  
  const handleCardClick = (cardIndex) => {
    if (isCurrentPlayer(playerID)) {
      moves.playCard(cardIndex);
    }
  };

  // Get player positions for 4-player layout
  const getPlayerPosition = (playerID) => {
    const positions = {
      0: 'top',    // North
      1: 'right',  // East  
      2: 'bottom', // South
      3: 'left'    // West
    };
    return positions[playerID] || 'bottom';
  };

  return (
    <div style={{ 
      width: '100vw',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#1a4d3a',
      color: 'white',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Game Info Bar */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        right: '10px',
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: window.innerWidth < 768 ? '6px 8px' : '8px 12px',
        borderRadius: '8px',
        fontSize: window.innerWidth < 768 ? '10px' : '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <strong>Trump:</strong> {G.trumpSuit} | <strong>Cards:</strong> {G.deck.length}
        </div>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: window.innerWidth < 768 ? '5px' : '10px',
          fontSize: window.innerWidth < 768 ? '9px' : '12px'
        }}>
          {G.scores.map((score, index) => (
            <span key={index}>
              P{index}: {score}
            </span>
          ))}
        </div>
      </div>

      {/* Center Area - Deck and Played Cards */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 50
      }}>
        {/* Deck Display */}
        <div style={{
          position: 'relative',
          marginBottom: '20px'
        }}>
          {/* Deck pile */}
          <div style={{
            width: window.innerWidth < 768 ? '45px' : '60px',
            height: window.innerWidth < 768 ? '68px' : '90px',
            backgroundImage: 'url(/cards/cardBack.png)',
            backgroundSize: 'cover',
            borderRadius: '6px',
            border: '2px solid #333',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            position: 'relative'
          }} />
          
          {/* Trump card sticking out horizontally */}
          <div style={{
            position: 'absolute',
            top: window.innerWidth < 768 ? '-12px' : '-15px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: window.innerWidth < 768 ? '45px' : '60px',
            height: window.innerWidth < 768 ? '68px' : '90px',
            backgroundImage: `url(/cards/card${SUIT_MAPPING[G.trumpCard.suit]}${VALUE_MAPPING[G.trumpCard.value]}.png)`,
            backgroundSize: 'cover',
            borderRadius: '6px',
            border: '2px solid #ff6b35',
            boxShadow: '0 6px 12px rgba(0,0,0,0.4)',
            zIndex: 2
          }} />
        </div>

        {/* Played Cards in Center */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '10px',
          minWidth: '200px',
          minHeight: '100px',
          alignItems: 'center'
        }}>
          {G.currentTrick.map((card, index) => (
            <Card
              key={`trick-${card.id}-${index}`}
              card={card}
              isPlayed={true}
            />
          ))}
        </div>
      </div>

      {/* Player Areas - 4 corners */}
      {G.hands.map((hand, playerID) => {
        const position = getPlayerPosition(playerID);
        const isCurrentPlayerTurn = isCurrentPlayer(playerID);
        const isOwnPlayer = isOwnHand(playerID);
        
        const getPlayerStyle = (pos) => {
          const baseStyle = {
            position: 'absolute',
            display: 'flex',
            flexDirection: pos === 'top' || pos === 'bottom' ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px',
            backgroundColor: isCurrentPlayerTurn ? 'rgba(33, 150, 243, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            border: isCurrentPlayerTurn ? '2px solid #2196F3' : '1px solid rgba(255, 255, 255, 0.3)',
            zIndex: 10
          };

          switch (pos) {
            case 'top':
              return { ...baseStyle, top: '60px', left: '50%', transform: 'translateX(-50%)' };
            case 'right':
              return { ...baseStyle, right: '10px', top: '50%', transform: 'translateY(-50%)' };
            case 'bottom':
              return { ...baseStyle, bottom: '10px', left: '50%', transform: 'translateX(-50%)' };
            case 'left':
              return { ...baseStyle, left: '10px', top: '50%', transform: 'translateY(-50%)' };
            default:
              return baseStyle;
          }
        };

        return (
          <div key={playerID} style={getPlayerStyle(position)}>
            {/* Player Name */}
            <div style={{
              fontSize: '12px',
              fontWeight: 'bold',
              marginBottom: position === 'top' || position === 'bottom' ? '5px' : '0',
              marginRight: position === 'left' || position === 'right' ? '10px' : '0',
              color: isCurrentPlayerTurn ? '#2196F3' : '#fff',
              textAlign: 'center'
            }}>
              {G.playerNames[playerID] || `Player ${playerID}`}
              {isCurrentPlayerTurn && ' (Your Turn)'}
            </div>
            
            {/* Player Cards */}
            <div style={{
              display: 'flex',
              flexDirection: position === 'top' || position === 'bottom' ? 'row' : 'column',
              gap: '3px',
              alignItems: 'center'
            }}>
              {hand.map((card, index) => (
                <Card
                  key={`${card.id}-${index}`}
                  card={card}
                  onClick={() => handleCardClick(index)}
                  isPlayable={isCurrentPlayerTurn}
                  isHidden={!isOwnPlayer}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Game Over Overlay */}
      {ctx.gameover && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '30px',
          borderRadius: '15px',
          textAlign: 'center',
          zIndex: 200,
          border: '2px solid #ff6b35'
        }}>
          <h2 style={{ color: '#ff6b35', marginBottom: '15px' }}>
            {ctx.gameover.winner !== undefined ? 
              `🎉 Player ${ctx.gameover.winner} Wins! 🎉` : 
              '🤝 It\'s a Draw! 🤝'
            }
          </h2>
          <div style={{ fontSize: '14px', marginBottom: '20px' }}>
            Final Scores: {G.scores.map((score, index) => (
              <span key={index} style={{ margin: '0 10px' }}>
                P{index}: {score}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
