import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.gameCode = null;
    this.playerName = null;
    this.isHost = false;
    this._pushRegisteredFor = null;
  }

  connect() {
    if (this.socket) return;
    
    const API = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}` : '');
    const SOCKET = process.env.REACT_APP_SOCKET_URL || API;
    this.socket = io(SOCKET, {
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  createGame(playerName, gameMode, gameCode) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.playerName = playerName;
      this.gameCode = gameCode;
      this.isHost = true;

      this.socket.emit('createGame', {
        playerName,
        gameMode,
        gameCode
      });

      this.socket.once('gameCreated', async (data) => {
        try {
          await this._ensurePushRegistered(playerName);
        } catch (e) {
          console.warn('Push registration failed on create:', e);
        }
        resolve(data);
      });

      this.socket.once('createError', (error) => {
        reject(error);
      });
    });
  }

  joinGame(playerName, gameCode) {
    return new Promise((resolve, reject) => {
      console.log('SocketService joinGame called:', { playerName, gameCode });
      
      if (!this.socket) {
        console.error('Socket not connected');
        reject(new Error('Not connected to server'));
        return;
      }

      this.playerName = playerName;
      this.gameCode = gameCode || this.gameCode; // keep existing if none provided
      this.isHost = false;

      console.log('Emitting joinGame event');
      this.socket.emit('joinGame', {
        playerName,
        gameCode: (gameCode || this.gameCode)
      });

      this.socket.once('gameJoined', async (data) => {
        console.log('Received gameJoined event:', data);
        if (data?.gameCode) this.gameCode = data.gameCode; // persist code from server
        try {
          await this._ensurePushRegistered(playerName);
        } catch (e) {
          console.warn('Push registration failed on join:', e);
        }
        resolve(data);
      });

      this.socket.once('joinError', (error) => {
        console.error('Received joinError event:', error);
        reject(error);
      });

      this.socket.once('gameStarted', (data) => {
        console.log('Received gameStarted event:', data);
        if (data?.gameCode) this.gameCode = data.gameCode; // persist code from server
        resolve(data);
      });

      // Add timeout to prevent hanging
      setTimeout(() => {
        reject(new Error('Join game timeout'));
      }, 10000);
    });
  }

  startGame() {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isHost) {
        reject(new Error('Not host or not connected'));
        return;
      }

      this.socket.emit('startGame', {
        gameCode: this.gameCode
      });

      this.socket.once('gameStarted', (data) => {
        resolve(data);
      });

      this.socket.once('startError', (error) => {
        reject(error);
      });
    });
  }

  onPlayerJoined(callback) {
    this.socket?.on('playerJoined', callback);
  }

  onPlayerLeft(callback) {
    this.socket?.on('playerLeft', callback);
  }

  onHostChanged(callback) {
    this.socket?.on('hostChanged', callback);
  }

  onGameStarted(callback) {
    this.socket?.on('gameStarted', callback);
  }

  onGameReadyToStart(callback) {
    this.socket?.on('gameReadyToStart', callback);
  }

  sendGameMove(move, args) {
    if (this.socket && this.gameCode) {
      console.log('SocketService sending game move:', { gameCode: this.gameCode, move, args });
      this.socket.emit('gameMove', {
        gameCode: this.gameCode,
        move,
        args
      });
    }
  }

  onGameMove(callback) {
    this.socket?.on('gameMove', callback);
  }

  onGameStateUpdate(callback) {
    this.socket?.on('gameStateUpdate', (data) => {
      console.log('SocketService received gameStateUpdate:', data);
      callback(data);
    });
  }

  onMoveError(callback) {
    this.socket?.on('moveError', callback);
  }

  requestGameState() {
    if (this.socket && this.gameCode) {
      console.log('Requesting game state for game:', this.gameCode);
      this.socket.emit('requestGameState', {
        gameCode: this.gameCode
      });
    }
  }

  // Force start game (for debugging)
  forceStartGame() {
    if (this.socket && this.gameCode) {
      console.log('Force starting game:', this.gameCode);
      this.socket.emit('startGame', {
        gameCode: this.gameCode
      });
    }
  }

  // Select team for 4-player games
  selectTeam(team) {
    if (this.socket && this.gameCode) {
      console.log('Selecting team:', team);
      this.socket.emit('selectTeam', {
        gameCode: this.gameCode,
        team
      });
    }
  }

  // Check for user's active games
  async getUserGames(socketId) {
    try {
      const API = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}` : '');
      const response = await fetch(`${API}/api/user/${socketId}/games`);
      const data = await response.json();
      return data.games;
    } catch (error) {
      console.error('Error fetching user games:', error);
      return [];
    }
  }

  // Check for user's active games by player name
  async getUserGamesByName(playerName) {
    try {
      const API = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}` : '');
      const response = await fetch(`${API}/api/user/name/${encodeURIComponent(playerName)}/games`);
      
      if (!response.ok) {
        console.log(`Server returned ${response.status} for player ${playerName}`);
        return [];
      }
      
      const data = await response.json();
      return data.games || [];
    } catch (error) {
      console.error('Error fetching user games by name:', error);
      return [];
    }
  }

  // Restore game from persistent storage
  async restoreGame(gameCode, socketId) {
    try {
      const API = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}` : '');
      const response = await fetch(`${API}/api/games/${gameCode}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ socketId })
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error restoring game:', error);
      throw error;
    }
  }

  // Make offline move
  async makeOfflineMove(gameCode, socketId, playerId, move, args) {
    try {
      const API = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}` : '');
      const response = await fetch(`${API}/api/games/${gameCode}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ socketId, playerId, move, args })
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error making offline move:', error);
      throw error;
    }
  }

  // Internal: register service worker and push subscription
  async _ensurePushRegistered(currentPlayerName) {
    try {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const playerName = currentPlayerName || this.playerName;
      if (!playerName) return;
      if (this._pushRegisteredFor && this._pushRegisteredFor === playerName) return;

      // Register SW
      const swReg = await navigator.serviceWorker.register('/briscola-sw.js');
      await navigator.serviceWorker.ready;

      // Fetch public VAPID key from backend (dev: swap 3000 -> 3001)
      const rawAPI = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}` : '');
      const API = rawAPI.endsWith(':3000') ? rawAPI.replace(':3000', ':3001') : rawAPI;
      const resp = await fetch(`${API}/api/push/public-key`);
      if (!resp.ok) {
        console.warn('Push public key not available (server not configured).');
        return;
      }
      const { publicKey } = await resp.json();
      const applicationServerKey = this._urlBase64ToUint8Array(publicKey);

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Subscribe
      const subscription = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

      // Send to server
      await fetch(`${API}/api/push-subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, subscription })
      });

      this._pushRegisteredFor = playerName;
    } catch (err) {
      console.warn('Push registration error:', err);
    }
  }

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

export default new SocketService();
