import React, { useState, useEffect } from 'react';
import Menu from './Menu';
import { ServerBoard } from './ServerBoard';
import socketService from './socketService';

function App() {
  const [gameState, setGameState] = useState('menu'); // 'menu', 'lobby', 'game'
  const [gameConfig, setGameConfig] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [serverGameState, setServerGameState] = useState(null);
  const [playerID, setPlayerID] = useState(null);
  const [gameReadyToStart, setGameReadyToStart] = useState(false);

  useEffect(() => {
    // Connect to server
    socketService.connect();
    setConnectionStatus('connecting');

    // Set up event listeners
    socketService.onPlayerJoined((data) => {
      console.log('Player joined:', data);
      setPlayers(data.players);
      
      // Auto-start game when 2 players are connected
      if (data.playerCount >= 2 && gameConfig && gameConfig.isHost) {
        console.log('Auto-starting game with 2 players');
        setTimeout(() => {
          handleStartPlaying();
        }, 1000); // Small delay to ensure all players are ready
      }
    });

    socketService.onPlayerLeft((data) => {
      console.log('Player left:', data);
      setPlayers(prev => prev.filter(p => p.name !== data.playerName));
    });

    socketService.onGameStarted((data) => {
      console.log('Game started:', data);
      console.log('Game state received:', data.gameState);
      console.log('Players received:', data.players);
      
      if (data.gameState) {
        setServerGameState(data.gameState);
      }
      
      if (data.players) {
        setPlayers(data.players);
      }
      
      // Find our player ID
      const ourPlayer = data.players.find(p => p.socketId === socketService.socket?.id);
      console.log('Our player:', ourPlayer);
      if (ourPlayer) {
        setPlayerID(ourPlayer.playerId);
      }
      
      setGameState('game');
    });

    socketService.onGameReadyToStart((data) => {
      console.log('Game ready to start event received:', data);
      setGameReadyToStart(true);
    });

    socketService.onGameStateUpdate((data) => {
      console.log('Game state updated:', data);
      setServerGameState(data.gameState);
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

  // Separate useEffect for requesting game state and auto-start
  useEffect(() => {
    if (gameState === 'game' && !serverGameState && players.length > 0) {
      console.log('Requesting game state from server...');
      const timer = setTimeout(() => {
        socketService.requestGameState();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState, serverGameState, players.length]);

  // Check game status via API as fallback
  useEffect(() => {
    if (gameState === 'game' && !serverGameState && gameConfig && gameConfig.gameCode) {
      const checkGameStatus = async () => {
        try {
          console.log('Checking game status via API...');
          const response = await fetch(`http://localhost:3001/api/games/${gameConfig.gameCode}`);
          const data = await response.json();
          console.log('Game status from API:', data);
          
          if (data.gameState) {
            console.log('Received game state from API, setting it...');
            setServerGameState(data.gameState);
          } else {
            console.log('No game state in API response, trying to start game...');
            // If no game state, try to start the game
            socketService.forceStartGame();
          }
        } catch (error) {
          console.error('Error checking game status:', error);
        }
      };
      
      const timer = setTimeout(checkGameStatus, 1000); // Faster check
      return () => clearTimeout(timer);
    }
  }, [gameState, serverGameState, gameConfig]);

  // Auto-start only for 2-player games
  useEffect(() => {
    if (gameState === 'lobby' && players.length >= 2 && gameConfig && gameConfig.isHost && gameConfig.mode === 'individual') {
      console.log('Auto-starting 2-player game from lobby');
      const timer = setTimeout(() => {
        handleStartPlaying();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState, players.length, gameConfig]);

  const handleStartGame = async (name, mode, gameCode) => {
    try {
      setPlayerName(name);
      setConnectionStatus('creating');
      
      const result = await socketService.createGame(name, mode, gameCode);
      setGameConfig({
        mode: mode === 'teams' ? 'teams' : 'individual',
        gameCode,
        isHost: true,
        players: result.players || []
      });
      setPlayers(result.players || []);
      setGameState('lobby');
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Error creating game:', error);
      setConnectionStatus('error');
    }
  };

  const handleJoinGame = async (name, code) => {
    try {
      console.log('Attempting to join game:', { name, code });
      setPlayerName(name);
      setConnectionStatus('joining');
      
      const result = await socketService.joinGame(name, code);
      console.log('Join game result:', result);
      
      setGameConfig({
        gameCode: code,
        isHost: false,
        mode: result.gameMode === 'teams' ? 'teams' : 'individual',
        players: result.players || []
      });
      setPlayers(result.players || []);
      setGameState('lobby');
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Error joining game:', error);
      setConnectionStatus('error');
      alert(`Error joining game: ${error.message || 'Unknown error'}`);
    }
  };

  const handleStartPlaying = async () => {
    try {
      console.log('Starting game...');
      setConnectionStatus('starting');
      await socketService.startGame();
      console.log('Game start request sent to server');
      // Game state will be updated by the socket event
    } catch (error) {
      console.error('Error starting game:', error);
      setConnectionStatus('error');
      alert(`Error starting game: ${error.message || 'Unknown error'}`);
    }
  };

  if (gameState === 'menu') {
    return <Menu onStartGame={handleStartGame} onJoinGame={handleJoinGame} />;
  }

  if (gameState === 'lobby') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#1a4d3a',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <h2>Game Lobby</h2>
          <p><strong>Game Code:</strong> {gameConfig.gameCode}</p>
          <p><strong>Player:</strong> {playerName}</p>
          <p><strong>Mode:</strong> {gameConfig.mode || '2 Players'}</p>
          <p><strong>Status:</strong> {connectionStatus}</p>
          
          {/* Players List */}
          <div style={{
            margin: '20px 0',
            padding: '15px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px'
          }}>
            <h4>Players ({players.length})</h4>
            {players.map((player, index) => (
              <div key={index} style={{
                padding: '5px',
                backgroundColor: player.isHost ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                margin: '5px 0',
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{player.name} {player.isHost ? '(Host)' : ''}</span>
                {gameConfig.mode === 'teams' && players.length === 4 && (
                  <div style={{ fontSize: '12px' }}>
                    {player.team ? (
                      <span style={{ 
                        color: player.team === 'team1' ? '#4CAF50' : '#2196F3',
                        fontWeight: 'bold'
                      }}>
                        Team {player.team === 'team1' ? '1' : '2'}
                      </span>
                    ) : (
                      <span style={{ color: '#ff9800' }}>Selecting team...</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Team Selection for team games */}
          {gameConfig.mode === 'teams' && (
            <div style={{
              margin: '20px 0',
              padding: '15px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px'
            }}>
              <h4>Team Selection</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <h5 style={{ color: '#4CAF50', margin: '5px 0' }}>Team 1</h5>
                  <div style={{ fontSize: '12px' }}>
                    {players.filter(p => p.team === 'team1').map(p => p.name).join(', ') || 'Empty'}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <h5 style={{ color: '#2196F3', margin: '5px 0' }}>Team 2</h5>
                  <div style={{ fontSize: '12px' }}>
                    {players.filter(p => p.team === 'team2').map(p => p.name).join(', ') || 'Empty'}
                  </div>
                </div>
              </div>
              
              {players.length < 4 ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ marginBottom: '10px', fontSize: '14px', color: '#ff9800' }}>
                    Waiting for {4 - players.length} more player{4 - players.length === 1 ? '' : 's'} to join...
                  </p>
                </div>
              ) : !players.find(p => p.socketId === socketService.socket?.id)?.team ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ marginBottom: '10px', fontSize: '14px' }}>Choose your team:</p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                      onClick={() => socketService.selectTeam('team1')}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Join Team 1
                    </button>
                    <button
                      onClick={() => socketService.selectTeam('team2')}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Join Team 2
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ marginBottom: '10px', fontSize: '14px', color: '#4CAF50' }}>
                    All players have selected teams! Host can start the game.
                  </p>
                </div>
              )}
            </div>
          )}
          
          {gameConfig.isHost && (
            <button
              onClick={handleStartPlaying}
              disabled={
                connectionStatus === 'starting' || 
                players.length < 2 || 
                (gameConfig.mode === 'teams' && (
                  !gameReadyToStart || 
                  players.length < 4 || 
                  players.some(p => !p.team)
                ))
              }
              style={{
                padding: '15px 30px',
                fontSize: '18px',
                backgroundColor: (
                  connectionStatus === 'starting' || 
                  players.length < 2 || 
                  (gameConfig.mode === 'teams' && (
                    !gameReadyToStart || 
                    players.length < 4 || 
                    players.some(p => !p.team)
                  ))
                ) ? '#666' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (
                  connectionStatus === 'starting' || 
                  players.length < 2 || 
                  (gameConfig.mode === 'teams' && (
                    !gameReadyToStart || 
                    players.length < 4 || 
                    players.some(p => !p.team)
                  ))
                ) ? 'not-allowed' : 'pointer',
                marginTop: '20px'
              }}
            >
              {connectionStatus === 'starting' ? 'Starting...' : 
               (gameConfig.mode === 'teams' && players.some(p => !p.team)) ? 'Waiting for Team Selection...' :
               (gameConfig.mode === 'teams' && (!gameReadyToStart || players.length < 4)) ? 'Waiting for Players...' : 
               'Start Game'}
            </button>
          )}
          
          {!gameConfig.isHost && (
            <div style={{
              padding: '15px',
              backgroundColor: 'rgba(33, 150, 243, 0.2)',
              borderRadius: '8px',
              marginTop: '20px',
              fontSize: '14px'
            }}>
              <p>Waiting for the host to start the game...</p>
              <p style={{ fontSize: '12px', opacity: 0.8, marginTop: '10px' }}>
                Share the game code with other players!
              </p>
            </div>
          )}
          
          {gameConfig.isHost && gameConfig.mode === 'teams' && players.length < 4 && (
            <div style={{
              padding: '15px',
              backgroundColor: 'rgba(255, 193, 7, 0.2)',
              borderRadius: '8px',
              marginTop: '20px',
              fontSize: '14px'
            }}>
              <p>Waiting for all 4 players to join...</p>
              <p style={{ fontSize: '12px', opacity: 0.8, marginTop: '10px' }}>
                Players joined: {players.length}/4
              </p>
            </div>
          )}
          
          {gameConfig.isHost && gameConfig.mode === 'teams' && players.length === 4 && gameReadyToStart && (
            <div style={{
              padding: '15px',
              backgroundColor: 'rgba(76, 175, 80, 0.2)',
              borderRadius: '8px',
              marginTop: '20px',
              fontSize: '14px'
            }}>
              <p>All 4 players have joined! You can now start the game.</p>
            </div>
          )}
          
          <button
            onClick={() => {
              socketService.disconnect();
              setGameState('menu');
            }}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  // Game component using server state
  console.log('App render - gameState:', gameState, 'serverGameState:', serverGameState, 'players:', players, 'playerID:', playerID);
  
  // If we're in game state but no server game state, show debug info
  if (gameState === 'game' && !serverGameState) {
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
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>Game State Issue</div>
        <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '10px' }}>
          Game State: {gameState}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '10px' }}>
          Server Game State: {serverGameState ? 'Received' : 'Missing'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '10px' }}>
          Players: {players ? players.length : 0}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '20px' }}>
          Player ID: {playerID !== null ? playerID : 'Not set'}
        </div>
        <button 
          onClick={() => {
            console.log('Manual game start attempt');
            socketService.forceStartGame();
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Force Start Game
        </button>
        <button 
          onClick={() => {
            console.log('Requesting game state manually');
            socketService.requestGameState();
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Request Game State
        </button>
        <button 
          onClick={async () => {
            console.log('Getting game state from API...');
            try {
              const response = await fetch(`http://localhost:3001/api/games/${gameConfig.gameCode}`);
              const data = await response.json();
              console.log('API response:', data);
              if (data.gameState) {
                setServerGameState(data.gameState);
              }
            } catch (error) {
              console.error('API error:', error);
            }
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Get from API
        </button>
        <button 
          onClick={async () => {
            console.log('Force starting game via API...');
            try {
              const response = await fetch(`http://localhost:3001/api/games/${gameConfig.gameCode}/start`, {
                method: 'POST'
              });
              const data = await response.json();
              console.log('Force start response:', data);
              if (data.gameState) {
                setServerGameState(data.gameState);
              }
            } catch (error) {
              console.error('Force start error:', error);
            }
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Force Start via API
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      <ServerBoard 
        gameState={serverGameState} 
        players={players} 
        playerID={playerID}
      />
    </div>
  );
}

export default App;
