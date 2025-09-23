import React, { useState } from 'react';

function Menu({ onStartGame, onJoinGame }) {
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [gameMode, setGameMode] = useState('2player');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    // Generate a random 6-digit game code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    onStartGame(playerName, gameMode, code);
  };

  const handleJoinGame = () => {
    console.log('Join game button clicked:', { playerName, gameCode });
    if (!playerName.trim() || !gameCode.trim()) {
      alert('Please enter your name and game code');
      return;
    }
    console.log('Calling onJoinGame with:', playerName, gameCode);
    onJoinGame(playerName, gameCode);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#1a4d3a',
      color: 'white',
      fontFamily: 'Arial, sans-serif',
      padding: '30px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        padding: window.innerWidth < 768 ? '20px' : '40px',
        borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        textAlign: 'center',
        maxWidth: window.innerWidth < 768 ? '100%' : '500px',
        width: '100%'
      }}>
        <h1 style={{
          fontSize: window.innerWidth < 768 ? '2.5rem' : '3rem',
          marginBottom: '10px',
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
        }}>
          🃏 Briscola 🃏
        </h1>
        
        <p style={{
          fontSize: window.innerWidth < 768 ? '1rem' : '1.2rem',
          marginBottom: '30px',
          opacity: 0.9
        }}>
          Traditional Italian Card Game
        </p>

        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{
              width: '100%',
              padding: window.innerWidth < 768 ? '15px' : '12px',
              fontSize: window.innerWidth < 768 ? '18px' : '16px',
              border: 'none',
              borderRadius: '8px',
              marginBottom: '15px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              color: '#333',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {!showJoinForm ? (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '18px' }}>
                Select Game Mode:
              </label>
              <div style={{ 
                display: 'flex', 
                gap: window.innerWidth < 768 ? '5px' : '10px', 
                justifyContent: 'center',
                flexDirection: window.innerWidth < 768 ? 'column' : 'row'
              }}>
                <button
                  onClick={() => setGameMode('2player')}
                  style={{
                    padding: window.innerWidth < 768 ? '15px' : '10px 20px',
                    backgroundColor: gameMode === '2player' ? '#4CAF50' : 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: window.innerWidth < 768 ? '18px' : '16px',
                    transition: 'all 0.3s ease',
                    width: window.innerWidth < 768 ? '100%' : 'auto'
                  }}
                >
                  2 Players
                </button>
                <button
                  onClick={() => setGameMode('teams')}
                  style={{
                    padding: window.innerWidth < 768 ? '15px' : '10px 20px',
                    backgroundColor: gameMode === 'teams' ? '#4CAF50' : 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: window.innerWidth < 768 ? '18px' : '16px',
                    transition: 'all 0.3s ease',
                    width: window.innerWidth < 768 ? '100%' : 'auto'
                  }}
                >
                  4 Players (Teams)
                </button>
              </div>
            </div>

            <button
              onClick={handleCreateGame}
              style={{
                width: '100%',
                padding: window.innerWidth < 768 ? '20px' : '15px',
                fontSize: window.innerWidth < 768 ? '20px' : '18px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '15px',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#45a049'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#4CAF50'}
            >
              Create New Game
            </button>

            <button
              onClick={() => setShowJoinForm(true)}
              style={{
                width: '100%',
                padding: '15px',
                fontSize: '18px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
            >
              Join Existing Game
            </button>
          </div>
        ) : (
          <div>
            <input
              type="text"
              placeholder="Enter game code"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value)}
              style={{
                width: '100%',
                padding: window.innerWidth < 768 ? '15px' : '12px',
                fontSize: window.innerWidth < 768 ? '18px' : '16px',
                border: 'none',
                borderRadius: '8px',
                marginBottom: '15px',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                color: '#333',
                boxSizing: 'border-box'
              }}
            />
            
            <button
              onClick={handleJoinGame}
              style={{
                width: '100%',
                padding: '15px',
                fontSize: '18px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '15px',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#1976D2'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#2196F3'}
            >
              Join Game
            </button>

            <button
              onClick={() => setShowJoinForm(false)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                backgroundColor: 'transparent',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              Back to Create Game
            </button>
          </div>
        )}

        <div style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '10px',
          fontSize: '14px',
          lineHeight: '1.6'
        }}>
          <h3 style={{ marginBottom: '10px' }}>How to Play:</h3>
          <ul style={{ textAlign: 'left', paddingLeft: '20px' }}>
            <li>Each player gets 3 cards</li>
            <li>Play cards to win tricks</li>
            <li>Trump suit beats other suits</li>
            <li>Collect points to win!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Menu;
