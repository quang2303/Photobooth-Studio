const EventEmitter = require('events');
const io = require('socket.io-client');
const os = require('os');

class SocketClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.streamToCloud = false;
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  isStreamingToCloud() {
    return this.streamToCloud;
  }

  connect(serverUrl, licenseKey, roomName, cameraSource, enableServerSync = true) {
    this.disconnect();

    if (!enableServerSync) {
      this.emit('status-change', { connected: false, message: 'Offline Mode (Server Sync Disabled)' });
      this.emit('log', 'Offline Mode active. WebSocket Server connection is disabled.');
      return;
    }

    if (!serverUrl || !licenseKey) {
      this.emit('status-change', { connected: false, message: 'Configuration Incomplete' });
      return;
    }

    this.emit('log', `Connecting to WebSocket Cloud Server at: ${serverUrl}...`);

    this.socket = io(serverUrl, {
      query: { licenseKey },
      reconnection: true,
      reconnectionDelay: 3000,
      transports: ['polling', 'websocket']
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.emit('status-change', { connected: true, message: 'Connected' });
      this.emit('log', 'Successfully connected to Cloud server.');

      // Register device ID with room binding
      const deviceId = (cameraSource === 'webcam')
        ? 'webcam-' + os.hostname()
        : (cameraSource === 'dslr_canon' ? 'canon-' : 'sony-') + process.platform + '-' + os.hostname();
      
      this.socket.emit('register-device', { licenseKey, deviceId, roomName: roomName || 'default-room' });
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.streamToCloud = false;
      this.emit('status-change', { connected: false, message: 'Disconnected' });
      this.emit('log', 'Disconnected from Cloud server.');
      this.emit('stop-stream');
    });

    this.socket.on('connect_error', (err) => {
      this.connected = false;
      this.streamToCloud = false;
      this.emit('status-change', { connected: false, message: 'Connection Error' });
      this.emit('log', `WebSocket connection error: ${err.message}`);
      this.emit('stop-stream');
    });

    this.socket.on('start-cloud-stream', () => {
      this.streamToCloud = true;
      this.emit('log', 'Cloud liveview requested. Starting stream to server.');
      this.emit('start-stream');
    });

    this.socket.on('stop-cloud-stream', () => {
      this.streamToCloud = false;
      this.emit('log', 'Cloud liveview idle. Pausing stream to server.');
      this.emit('stop-stream');
    });

    this.socket.on('server-command-capture', (data) => {
      this.emit('log', 'Remote capture command (server-command-capture) received.');
      this.emit('remote-capture', data);
    });

    this.socket.on('video-recording-command', (data) => {
      this.emit('log', `Socket command: video-recording-command with action=${data?.action}`);
      this.emit('remote-video', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.streamToCloud = false;
  }

  sendFrame(roomName, frameBuffer) {
    if (this.socket && this.connected && this.streamToCloud) {
      try {
        this.socket.emit('client-frame', {
          roomName: roomName || 'default-room',
          frame: frameBuffer
        });
      } catch (err) {
        console.error('Failed to emit client-frame:', err);
      }
    }
  }

  uploadPhoto(roomName, fileName, imageBuffer, googleDriveInfo = null) {
    if (this.socket && this.connected) {
      try {
        this.socket.emit('client-upload-photo', {
          roomName: roomName || 'default-room',
          fileName,
          imageBuffer,
          googleDriveInfo
        });
        return true;
      } catch (err) {
        this.emit('log', `Failed to upload photo: ${err.message}`);
      }
    }
    return false;
  }
}

module.exports = new SocketClient();
