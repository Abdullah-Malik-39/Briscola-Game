import React, { useState, useEffect } from 'react';
import socketService from './socketService';

// Direct mapping since server now sends English names
const SUIT_MAPPING = {
  'Clubs': 'Clubs',
  'Hearts': 'Hearts', 
  'Diamonds': 'Diamonds',
  'Spades': 'Spades'
};

const VALUE_MAPPING = {
  'A': 'A',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  'J': 'J',
  'Q': 'Q',
  'K': 'K'
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

function PlayerArea({ player, gameState, currentPlayer, playerID, onCardClick }) {
  const isCurrentPlayerTurn = currentPlayer === player.playerId;
  const isOwnPlayer = player.playerId === playerID;
  const playerHand = gameState.hands[player.playerId] || [];
  
  // Find the card this player played in the current trick
  const playedCard = gameState.currentTrick.find(card => card.player === player.playerId);
  
  const getPlayerPosition = (playerId) => {
    const positions = {
      0: 'top',    // North
      1: 'right',  // East  
      2: 'bottom', // South
      3: 'left'    // West
    };
    return positions[playerId] || 'bottom';
  };

  const position = getPlayerPosition(player.playerId);
  
  const getPlayerStyle = (pos) => {
    const isMobile = window.innerWidth < 768;
    const baseStyle = {
      position: 'absolute',
      display: 'flex',
      flexDirection: pos === 'top' || pos === 'bottom' ? 'column' : (isMobile ? 'column' : 'row'),
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
        return { 
          ...baseStyle, 
          right: '10px', 
          top: '50%', 
          transform: 'translateY(-50%)',
          flexDirection: isMobile ? 'column' : 'row'
        };
      case 'bottom':
        return { ...baseStyle, bottom: '10px', left: '50%', transform: 'translateX(-50%)' };
      case 'left':
        return { 
          ...baseStyle, 
          left: '10px', 
          top: '50%', 
          transform: 'translateY(-50%)',
          flexDirection: isMobile ? 'column' : 'row'
        };
      default:
        return baseStyle;
    }
  };

  // Determine flex direction based on player position
  const getFlexDirection = () => {
    switch (position) {
      case 'top':
        return 'column'; // Player info above, played card below
      case 'bottom':
        return 'column-reverse'; // Played card above, player info below
      case 'left':
        return 'row'; // Player info left, played card right
      case 'right':
        return 'row-reverse'; // Played card left, player info right
      default:
        return 'column';
    }
  };

  return (
    <div style={{
      position: 'absolute',
      display: 'flex',
      flexDirection: getFlexDirection(),
      alignItems: 'center',
      justifyContent: 'center',
      padding: '10px',
      zIndex: 10,
      ...(position === 'top' ? {
        top: '60px',
        left: '50%',
        transform: 'translateX(-50%)'
      } : position === 'right' ? {
        right: '10px',
        top: '50%',
        transform: 'translateY(-50%)'
      } : position === 'bottom' ? {
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)'
      } : position === 'left' ? {
        left: '10px',
        top: '50%',
        transform: 'translateY(-50%)'
      } : {})
    }}>
      {/* Main Player Area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isCurrentPlayerTurn ? 'rgba(33, 150, 243, 0.3)' : 'rgba(0, 0, 0, 0.2)',
        borderRadius: '8px',
        border: isCurrentPlayerTurn ? '2px solid #2196F3' : '1px solid rgba(255, 255, 255, 0.3)',
        padding: '5px'
      }}>
        {/* Player Name and Score */}
        <div style={{
          fontSize: '12px',
          fontWeight: 'bold',
          marginBottom: position === 'top' || position === 'bottom' ? '5px' : (window.innerWidth < 768 ? '5px' : '0'),
          marginRight: position === 'left' || position === 'right' ? (window.innerWidth < 768 ? '0' : '10px') : '0',
          color: isCurrentPlayerTurn ? '#2196F3' : '#fff',
          textAlign: 'center',
          maxWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          <div style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>{player.playerName.length > 12 ? player.playerName.substring(0, 8) + '...' : player.playerName}</div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>
            {gameState.gameMode === 'teams' ? (
              <span>
                Team Score: {gameState.teamScores ? 
                  (gameState.teams[player.playerId] === 'team1' ? gameState.teamScores[0] : gameState.teamScores[1]) : 0
                }
              </span>
            ) : (
              <span>Score: {gameState.scores[player.playerId] || 0}</span>
            )}
          </div>
          {isCurrentPlayerTurn && <div style={{ fontSize: '10px' }}>(Your Turn)</div>}
        </div>
        
        {/* Player Cards */}
        <div style={{
          display: 'flex',
          flexDirection: position === 'top' || position === 'bottom' ? 'row' : (window.innerWidth < 768 ? 'column' : 'column'),
          gap: '3px',
          alignItems: 'center'
        }}>
          {playerHand.map((card, index) => (
            <Card
              key={`${card.id}-${index}`}
              card={card}
              onClick={() => onCardClick(player.playerId, index)}
              isPlayable={isCurrentPlayerTurn && isOwnPlayer}
              isHidden={!isOwnPlayer}
            />
          ))}
        </div>
      </div>
      
      {/* Played Card Display */}
      {playedCard && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          margin: '10px'
        }}>
          <div style={{
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: '5px',
            textAlign: 'center'
          }}>
            Played:
          </div>
          <Card
            card={playedCard}
            isPlayed={true}
            isHidden={false}
          />
        </div>
      )}
    </div>
  );
}

export function ServerBoard({ gameState, players, playerID, gameConfig, userSession }) {
  const [localGameState, setLocalGameState] = useState(gameState);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (gameState) {
      setLocalGameState(gameState);
    }
  }, [gameState]);

  useEffect(() => {
    // Listen for game state updates
    const handleGameStateUpdate = (data) => {
      console.log('Received game state update:', data);
      console.log('New game state hands:', data.gameState?.hands);
      console.log('New game state deck length:', data.gameState?.deck?.length);
      setLocalGameState(data.gameState);
    };

    const handleMoveError = (error) => {
      console.log('Move error received:', error);
      setError(error.message);
      setTimeout(() => setError(null), 3000);
    };

    socketService.onGameStateUpdate(handleGameStateUpdate);
    socketService.onMoveError(handleMoveError);

    return () => {
      // Cleanup listeners if needed
    };
  }, []);

  const handleCardClick = async (playerId, cardIndex) => {
    if (localGameState && localGameState.currentPlayer === playerId) {
      // Check if we're in offline mode (no active socket connection)
      if (!socketService.socket || !socketService.socket.connected) {
        console.log('Making offline move');
        try {
          const result = await socketService.makeOfflineMove(
            gameConfig.gameCode,
            userSession?.socketId,
            playerId,
            'playCard',
            { cardIndex }
          );
          console.log('Offline move result:', result);
          
          // Update local game state
          setLocalGameState(result.gameState);
        } catch (error) {
          console.error('Error making offline move:', error);
          alert(`Error making move: ${error.message || 'Unknown error'}`);
        }
      } else {
        // Normal online move
        socketService.sendGameMove('playCard', [cardIndex]);
      }
    }
  };

  // Debug logging
  console.log('ServerBoard render:', { gameState, players, playerID, localGameState });
  if (localGameState && localGameState.gameMode === 'teams') {
    console.log('Team game debug:', {
      gameMode: localGameState.gameMode,
      teamScores: localGameState.teamScores,
      teams: localGameState.teams,
      scores: localGameState.scores
    });
  }

  if (!localGameState) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a4d3a',
        color: 'white',
        padding: '20px'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>Loading game...</div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          Game State: {gameState ? 'Received' : 'Waiting...'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          Players: {players ? players.length : 0}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          Player ID: {playerID !== null ? playerID : 'Not set'}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '10px' }}>
          Debug: gameState={JSON.stringify(gameState)}
        </div>
        <button 
          onClick={() => {
            console.log('Manual game state request');
            socketService.requestGameState();
          }}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Request Game State
        </button>
      </div>
    );
  }

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
      {/* Error Message */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          zIndex: 200,
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

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
          <strong>Trump:</strong> {localGameState.trumpSuit} | <strong>Deck:</strong> {localGameState.deck.length} cards
        </div>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: window.innerWidth < 768 ? '5px' : '10px',
          fontSize: window.innerWidth < 768 ? '9px' : '12px'
        }}>
          {localGameState.gameMode === 'teams' ? (
            <>
              <span style={{ color: '#4CAF50' }}>
                Team 1: {localGameState.teamScores ? localGameState.teamScores[0] : 0}
              </span>
              <span style={{ color: '#2196F3' }}>
                Team 2: {localGameState.teamScores ? localGameState.teamScores[1] : 0}
              </span>
            </>
          ) : (
            localGameState.scores.map((score, index) => (
              <span key={index}>
                P{index}: {score}
              </span>
            ))
          )}
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
          
          
          {/* Trump card sticking out */}
          <div style={{
            position: 'absolute',
            top: window.innerWidth < 768 ? '-15px' : '-20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: window.innerWidth < 768 ? '45px' : '60px',
            height: window.innerWidth < 768 ? '68px' : '90px',
            backgroundImage: `url(/cards/card${SUIT_MAPPING[localGameState.trumpCard.suit]}${VALUE_MAPPING[localGameState.trumpCard.value]}.png)`,
            backgroundSize: 'cover',
            borderRadius: '6px',
            border: '2px solid #ff6b35',
            boxShadow: '0 6px 12px rgba(0,0,0,0.4)',
            zIndex: 0
          }} />

           {/* Deck pile */}
           <div style={{
             width: window.innerWidth < 768 ? '50px' : '66px',
             height: window.innerWidth < 768 ? '68px' : '90px',
             backgroundImage: 'url(/cards/cardBack.png)',
             backgroundSize: 'cover',
             borderRadius: '2px',
             border: '2px solid #333',
             boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
             position: 'relative',
             transform: 'rotate(90deg)'
           }} />
        </div>

        {/* Played Cards in Center - Only show if no cards played yet */}
        {localGameState.currentTrick.length === 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px',
            minWidth: '200px',
            minHeight: '100px',
            alignItems: 'center'
          }}>
            <div style={{
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              Waiting for cards to be played...
            </div>
          </div>
        )}
      </div>

      {/* Player Areas */}
      {players.map((player) => (
        <PlayerArea
          key={player.playerId}
          player={player}
          gameState={localGameState}
          currentPlayer={localGameState.currentPlayer}
          playerID={playerID}
          onCardClick={handleCardClick}
        />
      ))}

      {/* Game Over Overlay */}
      {localGameState.gamePhase === 'finished' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center',
          zIndex: 200,
          border: '3px solid #ff6b35',
          minWidth: '300px',
          maxWidth: '90vw'
        }}>
          <h2 style={{ color: '#ff6b35', marginBottom: '20px', fontSize: '24px' }}>
            🎉 Game Over! 🎉
          </h2>
          
          {/* Final Scores */}
          <div style={{ fontSize: '18px', marginBottom: '20px' }}>
            <div style={{ marginBottom: '15px', fontWeight: 'bold' }}>Final Scores:</div>
            {localGameState.gameMode === 'teams' ? (
              <div>
                <div style={{ 
                  margin: '5px 0',
                  padding: '8px 15px',
                  backgroundColor: 'rgba(76, 175, 80, 0.3)',
                  borderRadius: '8px',
                  border: '2px solid #4CAF50',
                  color: '#4CAF50'
                }}>
                  Team 1: {localGameState.teamScores ? localGameState.teamScores[0] : 0} points
                </div>
                <div style={{ 
                  margin: '5px 0',
                  padding: '8px 15px',
                  backgroundColor: 'rgba(33, 150, 243, 0.3)',
                  borderRadius: '8px',
                  border: '2px solid #2196F3',
                  color: '#2196F3'
                }}>
                  Team 2: {localGameState.teamScores ? localGameState.teamScores[1] : 0} points
                </div>
              </div>
            ) : (
              localGameState.scores.map((score, index) => (
                <div key={index} style={{ 
                  margin: '5px 0',
                  padding: '8px 15px',
                  backgroundColor: index === playerID ? 'rgba(33, 150, 243, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  border: index === playerID ? '2px solid #2196F3' : '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  {localGameState.playerNames[index] || `Player ${index}`}: {score} points
                </div>
              ))
            )}
          </div>

          {/* Winner/Loser Message */}
          <div style={{ 
            fontSize: '20px', 
            marginBottom: '25px',
            fontWeight: 'bold',
            color: localGameState.gameMode === 'teams' ? 
              (localGameState.teamScores && localGameState.teams[playerID] === 'team1' ? 
                (localGameState.teamScores[0] > localGameState.teamScores[1] ? '#4CAF50' : '#f44336') :
                (localGameState.teamScores && localGameState.teams[playerID] === 'team2' ? 
                  (localGameState.teamScores[1] > localGameState.teamScores[0] ? '#4CAF50' : '#f44336') : '#f44336')
              ) :
              (localGameState.scores[playerID] === Math.max(...localGameState.scores) ? '#4CAF50' : '#f44336')
          }}>
            {localGameState.gameMode === 'teams' ? (
              localGameState.teamScores && localGameState.teams[playerID] ? (
                (localGameState.teams[playerID] === 'team1' && localGameState.teamScores[0] > localGameState.teamScores[1]) ||
                (localGameState.teams[playerID] === 'team2' && localGameState.teamScores[1] > localGameState.teamScores[0]) ?
                  '🏆 Your Team Won! 🏆' : '😞 Your Team Lost 😞'
              ) : '😞 Game Over 😞'
            ) : (
              localGameState.scores[playerID] === Math.max(...localGameState.scores) ? 
                '🏆 You Win! 🏆' : '😞 You Lost 😞'
            )}
          </div>

          {/* Back to Menu Button */}
          <button
            onClick={() => {
              // Go back to menu by reloading the page or navigating
              window.location.reload();
            }}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#1976D2';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#2196F3';
              e.target.style.transform = 'scale(1)';
            }}
          >
            Back to Menu
          </button>
        </div>
      )}
    </div>
  );
}
