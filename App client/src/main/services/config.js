const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
  constructor() {
    const userDataDir = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
    const picturesDir = (app && typeof app.getPath === 'function') ? app.getPath('pictures') : path.join(process.cwd(), 'photos');
    this.configPath = path.join(userDataDir, 'agent_config.json');
    this.config = {
      licenseKey: 'DEMO-LICENSE-12345',
      serverUrl: 'http://localhost:3000',
      cameraSource: 'webcam',
      frameOverlayPath: '',
      language: 'vi',
      roomName: 'default-room',
      webcamDeviceId: '',
      liveViewQuality: 'high',
      enableServerSync: false, // Default false to prevent flooding cloud server with frames
      googleDriveRefreshToken: '',
      googleDriveUserEmail: '',
      googleDriveFolderId: '',
      storageMode: 'local', // 'local' | 'gdrive' | 'both'
      kioskCountdown: 3,
      kioskAutoResetDelay: 15,
      localSavePath: path.join(picturesDir, 'PhotoBooth'),
      frameEnabled: true,
      frameAspectRatio: '3:2',
      frameLayers: [],
      preferServerFrame: false
    };
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...this.config, ...JSON.parse(data) };
        if (this.config.cameraSource === 'dslr' || this.config.cameraSource === 'dslr_digicam') {
          this.config.cameraSource = 'dslr_canon';
        }
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
    }
    return this.config;
  }

  save(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save configuration:', err);
    }
    return this.config;
  }

  get() {
    return this.config;
  }
}

// Export a singleton instance
module.exports = new ConfigManager();
