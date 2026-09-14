const { app } = require('electron');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const SonyDriver = require('./drivers/SonyDriver');
const CanonDriver = require('./drivers/CanonDriver');

class CameraManager extends EventEmitter {
  constructor() {
    super();
    this.source = 'dslr_canon'; // 'dslr_canon' | 'dslr_sony'
    this.cameraConnected = false;
    this.detectedModel = null;
    this.detectTimer = null;
    
    const os = require('os');
    const baseDir = (app && typeof app.getPath === 'function') ? app.getPath('userData') : path.join(os.tmpdir(), 'camera-sync-agent');
    this.tempDir = path.join(baseDir, 'tmp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Khởi tạo các driver
    this.drivers = {
      dslr_canon: new CanonDriver(this.tempDir),
      dslr_sony: new SonyDriver(this.tempDir)
    };

    this.activeDriver = this.drivers[this.source];
  }

  get isStreaming() {
    return this.activeDriver ? this.activeDriver.isStreaming : false;
  }

  get isCapturing() {
    return this.activeDriver ? this.activeDriver.isCapturing : false;
  }

  async initialize() {
    this.emit('log', 'Initializing CameraManager and drivers...');
    for (const key in this.drivers) {
      // Forward logs from drivers
      this.drivers[key].on('log', (msg) => {
        this.emit('log', msg);
      });
      await this.drivers[key].initialize();
    }

    // Lắng nghe sự kiện từ driver dslr_sony để ngắt kết nối khi lỗi stream
    this.drivers.dslr_sony.on('camera_disconnected', () => {
      if (this.source === 'dslr_sony' && this.cameraConnected) {
        this.cameraConnected = false;
        this.detectedModel = null;
        this.emit('camera_disconnected');
      }
    });

    this.setupActiveDriverListeners();
  }

  setupActiveDriverListeners() {
    // Remove all previous listeners for 'frame' to avoid memory leaks
    for (const key in this.drivers) {
      this.drivers[key].removeAllListeners('frame');
    }

    if (this.activeDriver) {
      this.activeDriver.on('frame', (buffer) => {
        this.emit('frame', buffer);
      });
    }
  }

  setSource(source) {
    if (this.source !== source) {
      this.emit('log', `Changing camera source to: ${source}`);
      this.stopAutoDetect();
      this.stopLiveViewStream();
      
      // Clean up old driver if switching away from Sony
      if (this.source === 'dslr_sony' && source !== 'dslr_sony') {
        this.drivers.dslr_sony.stopSonyServer();
      }

      this.source = source;
      this.activeDriver = this.drivers[source] || null;
      this.cameraConnected = false;
      this.detectedModel = null;

      this.setupActiveDriverListeners();

      if (source === 'dslr_canon' || source === 'dslr_sony') {
        this.startAutoDetect();
      }
    } else if (source === 'dslr_canon' || source === 'dslr_sony') {
      // Source re-asserted: make sure auto-detect and live view are active
      this.setupActiveDriverListeners();
      this.startAutoDetect();
      if (!this.isStreaming && !this.isCapturing) {
        this.startLiveViewStream();
      }
    }
  }

  startAutoDetect() {
    if (this.detectTimer) return;

    const poll = async () => {
      if (this.isCapturing) {
        this.detectTimer = setTimeout(poll, 3000);
        return;
      }

      try {
        const camera = await this.detectCamera();
        if (camera) {
          const wasConnected = this.cameraConnected;
          this.cameraConnected = true;
          this.detectedModel = camera.model;
          if (!wasConnected || this.detectedModel !== camera.model) {
            this.emit('camera_connected', camera);
          }
          // Ensure live view is streaming if camera is connected and on DSLR source
          if (!this.isStreaming && !this.isCapturing && (this.source === 'dslr_canon' || this.source === 'dslr_sony')) {
            this.startLiveViewStream();
          }
        } else {
          if (this.cameraConnected) {
            this.cameraConnected = false;
            this.detectedModel = null;
            this.emit('camera_disconnected');
            this.stopLiveViewStream();
          }
        }
      } catch (err) {
        this.emit('log', `Error in auto-detect: ${err.message}`);
      }

      if (this.detectTimer) {
        this.detectTimer = setTimeout(poll, 3000);
      }
    };

    this.detectTimer = setTimeout(poll, 0);
  }

  stopAutoDetect() {
    if (this.detectTimer) {
      clearTimeout(this.detectTimer);
      this.detectTimer = null;
    }
  }

  async detectCamera() {
    if (!this.activeDriver) return null;
    return await this.activeDriver.detect();
  }

  startLiveViewStream() {
    if (!this.activeDriver) return;
    this.activeDriver.startLiveView();
    this.emit('stream_started');
  }

  stopLiveViewStream() {
    if (!this.activeDriver) return;
    this.activeDriver.stopLiveView();
    this.emit('stream_stopped');
  }

  async captureHighResPhoto() {
    if (!this.activeDriver) {
      throw new Error('No active camera driver selected');
    }
    return await this.activeDriver.capturePhoto();
  }

  async startSonyVideoRecording() {
    if (this.source === 'dslr_sony') {
      await this.drivers.dslr_sony.startRecording();
    }
  }

  async stopSonyVideoRecording() {
    if (this.source === 'dslr_sony') {
      return await this.drivers.dslr_sony.stopRecording();
    }
    return null;
  }

  cleanup() {
    this.stopAutoDetect();
    this.stopLiveViewStream();
    for (const key in this.drivers) {
      this.drivers[key].cleanup();
    }
  }
}

module.exports = CameraManager;
