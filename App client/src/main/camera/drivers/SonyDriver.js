const BaseDriver = require('./BaseDriver');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
let ServerManager = null;

class SonyDriver extends BaseDriver {
  constructor(tempDir) {
    super();
    this.tempDir = tempDir;
    this.sonyServer = null;
    this.sonyCameraId = null;
    this.sonyLiveViewTimer = null;
    this.sony404Count = 0;
    this.sonyFrameErrorCount = 0;
    this.isStreaming = false;
    this.isCapturing = false;
    this.detectedModel = null;
    this.cameraConnected = false;
    this.isConnecting = false;
    // Dedicated temp directory without spaces for Sony REST API
    this.sonyTempDir = path.join(os.tmpdir(), 'camera-sync-agent');
  }

  async initialize() {
    try {
      const module = await import('@alpha-sdk/api');
      ServerManager = module.ServerManager;
      this.emit('log', 'Successfully loaded Sony Alpha REST API modules.');
    } catch (err) {
      this.emit('log', `Warning: Failed to load Sony Alpha REST API modules: ${err.message}`);
    }
  }

  async startSonyServer() {
    if (this.sonyServer || !ServerManager) return;
    try {
      this.emit('log', 'Starting Sony Alpha Camera API Server...');
      this.sonyServer = new ServerManager({ port: 8080, autoPort: false });
      await this.sonyServer.start();
      this.emit('log', `Sony Alpha Camera API Server started on port ${this.sonyServer.getPort()}`);
    } catch (err) {
      this.emit('log', `Failed to start Sony Camera API Server: ${err.message}`);
      this.sonyServer = null;
    }
  }

  async stopSonyServer() {
    if (this.sonyServer) {
      this.emit('log', 'Stopping Sony Alpha Camera API Server...');
      try {
        await this.sonyServer.stop();
      } catch (err) {
        this.emit('log', `Error stopping Sony Server: ${err.message}`);
      }
      this.sonyServer = null;
      this.sonyCameraId = null;
      this.cameraConnected = false;
      this.detectedModel = null;
    }
  }

  async detect() {
    if (!ServerManager) return null;

    // Ensure the Server is running!
    await this.startSonyServer();
    if (!this.sonyServer) return null;

    try {
      // If we are actively streaming frames, skip the HTTP request to avoid blocking the Sony API Server
      if (this.isStreaming && this.sonyCameraId) {
        return { model: this.detectedModel || 'Sony Camera', port: 'sony-usb' };
      }

      // Get list of connected cameras
      const res = await fetch(`http://127.0.0.1:8080/api/cameras`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        this.emit('log', `Sony API check failed: HTTP Status ${res.status}`);
        return null;
      }
      const data = await res.json();
      const list = data.cameras || [];
      if (!Array.isArray(list) || list.length === 0) {
        this.sonyCameraId = null;
        this.cameraConnected = false;
        this.detectedModel = null;
        // Log connection hint periodically
        if (!this.lastSonyEmptyLog || Date.now() - this.lastSonyEmptyLog > 10000) {
          this.emit('log', 'Sony API check: No cameras detected. Note: Sony official SDK does NOT support WinUSB driver. Ensure you restore the default Sony camera driver in Device Manager, and set the camera to PC Remote mode.');
          this.lastSonyEmptyLog = Date.now();
        }
        return null;
      }
      
      const camera = list[0]; // Get the first camera
      const newCameraId = camera.id;
      
      // If we detect a new camera and are not already in the middle of connecting
      if (this.sonyCameraId !== newCameraId) {
        if (this.isConnecting) {
          return null; // Let the current connection attempt finish
        }
        
        this.isConnecting = true;
        this.sonyCameraId = newCameraId;
        this.cameraConnected = false;
        this.detectedModel = camera.model || 'Sony Camera';
        
        this.emit('log', `Detected Sony Camera ID: ${this.sonyCameraId} (Model: ${this.detectedModel})`);
        
        // Explicitly disconnect first to release any stale session on the server
        try {
          await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/connection`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(3000)
          });
        } catch (e) {
          // Ignore errors during pre-cleanup disconnect
        }

        // Connect to the camera in remote-transfer mode for explicit SD card file download
        const connectRes = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'remote-transfer', reconnecting: 'on' }),
          signal: AbortSignal.timeout(8000)
        });
        if (connectRes.ok) {
          this.emit('log', `Connect request accepted for Sony Camera: ${this.sonyCameraId}. Waiting for camera to be ready...`);
          // Poll connection status until camera is truly connected (async USB handshake)
          const ready = await this.waitForConnection(30000);
          if (ready) {
            this.cameraConnected = true;
            this.isConnecting = false;
            this.emit('log', `Sony Camera ${this.sonyCameraId} is fully connected (remote-transfer mode).`);
            await this.setPriorityKey();
          } else {
            this.emit('log', `Warning: Sony Camera ${this.sonyCameraId} did not become ready in time. Will retry on next detect cycle.`);
            this.sonyCameraId = null; // Reset to retry next cycle
            this.cameraConnected = false;
            this.isConnecting = false;
          }
        } else {
          this.emit('log', `Warning: Failed to establish connection session for Sony Camera: ${this.sonyCameraId}`);
          this.sonyCameraId = null;
          this.cameraConnected = false;
          this.isConnecting = false;
        }
      }
      
      return this.cameraConnected ? { model: this.detectedModel, port: 'sony-usb' } : null;
    } catch (err) {
      this.emit('log', `Error calling Sony API: ${err.message}`);
      if (this.sonyServer) {
        const out = this.sonyServer.getStdout().slice(-3).join('\n');
        const serr = this.sonyServer.getStderr().slice(-3).join('\n');
        if (out) this.emit('log', `Sony Server Stdout: ${out}`);
        if (serr) this.emit('log', `Sony Server Stderr: ${serr}`);
      }
      return null;
    }
  }

  async waitForConnection(timeoutMs = 15000) {
    const pollInterval = 1000;
    const maxAttempts = Math.ceil(timeoutMs / pollInterval);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/connection`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.camera?.connected === true || data.connected === true) {
            return true;
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, pollInterval));
      }
    }
    return false;
  }

  async setPriorityKey() {
    if (!this.sonyCameraId) return;
    try {
      this.emit('log', 'Setting Sony priority key to pc-remote...');
      const res = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/priority-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setting: 'pc-remote' }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        this.emit('log', 'Sony priority key set to pc-remote successfully.');
      } else {
        const errText = await res.text().catch(() => 'No response body');
        this.emit('log', `Warning: Failed to set Sony priority key (Status: ${res.status}, Error: ${errText}).`);
      }
    } catch (err) {
      this.emit('log', `Warning: Error setting Sony priority key: ${err.message}`);
    }
  }

  async startLiveView() {
    if (!this.sonyCameraId) {
      this.emit('log', 'Warning: Sony camera ID is not set. Trying to auto-detect...');
      await this.detect();
      if (!this.sonyCameraId) {
        this.emit('log', 'Error: No Sony Camera detected to start Live View.');
        return;
      }
    }

    if (this.isStreaming || this.isCapturing) return;
    this.isStreaming = true;

    this.emit('log', 'Starting Sony live view stream...');
    try {
      // Enable live-view
      await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/live-view/start`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000)
      });
      
      this.runSonyPreviewLoop();
    } catch (err) {
      this.emit('log', `Error starting Sony live view: ${err.message}`);
      this.isStreaming = false;
      setTimeout(() => this.startLiveView(), 2000);
    }
  }

  stopLiveView() {
    if (!this.isStreaming) return;
    this.isStreaming = false;

    if (this.sonyLiveViewTimer) {
      clearTimeout(this.sonyLiveViewTimer);
      this.sonyLiveViewTimer = null;
    }

    if (this.sonyCameraId) {
      fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/live-view/stop`, {
        method: 'POST'
      }).catch((err) => {
        this.emit('log', `Warning: Failed to stop Sony live view worker: ${err.message}`);
      });
    }
  }

  async stopSonyLiveViewApi() {
    if (!this.sonyCameraId) return;
    try {
      this.emit('log', 'Sending Sony live-view/stop API request...');
      const res = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/live-view/stop`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) {
        this.emit('log', `Warning: Sony live-view/stop returned status ${res.status}`);
      }
    } catch (err) {
      this.emit('log', `Warning: Failed to stop Sony live view worker: ${err.message}`);
    }
  }

  async startSonyLiveViewApi() {
    if (!this.sonyCameraId) return;
    try {
      this.emit('log', 'Sending Sony live-view/start API request...');
      const res = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/live-view/start`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) {
        this.emit('log', `Warning: Sony live-view/start returned status ${res.status}`);
      }
    } catch (err) {
      this.emit('log', `Warning: Failed to start Sony live view worker: ${err.message}`);
    }
  }

  runSonyPreviewLoop() {
    if (!this.isStreaming || this.isCapturing || !this.sonyCameraId) return;

    const options = {
      hostname: '127.0.0.1', // Use IPv4 loopback directly
      port: 8080,
      path: `/api/cameras/${this.sonyCameraId}/live-view/frame`,
      method: 'GET',
      agent: keepAliveAgent,
      timeout: 1000
    };

    const handleNetworkError = (msg) => {
      this.sonyFrameErrorCount++;
      if (this.sonyFrameErrorCount >= 10) {
        this.emit('log', `Sony camera liveview frame stream failed repeatedly (${msg}). Marking camera as disconnected.`);
        this.cameraConnected = false;
        this.detectedModel = null;
        this.isStreaming = false;
        this.sonyCameraId = null; // Reset camera ID to trigger reconnection on next detect cycle
        this.emit('camera_disconnected');
        this.sonyFrameErrorCount = 0;
      }
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        this.sonyFrameErrorCount = 0; // Reset network error count
        if (this.sony404Count > 0) {
          this.emit('log', `Sony live view stream active (recovered after ${this.sony404Count} retries).`);
          this.sony404Count = 0;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          this.emit('frame', buffer);
          
          if (this.isStreaming && !this.isCapturing) {
            // Poll at maximum speed to increase FPS
            this.sonyLiveViewTimer = setTimeout(() => this.runSonyPreviewLoop(), 1);
          }
        });
      } else if (res.statusCode === 404) {
        this.sony404Count++;
        // Check if 404 persists for too long (e.g. 30 times * 1.5s = 45 seconds of no liveview data)
        if (this.sony404Count >= 30) {
          handleNetworkError('404 Not Found persisted for 45s');
        }
        // Only log 404 warning every 3 retries (~4.5 seconds) so we don't spam the console during camera initialization
        if (this.sony404Count % 3 === 1) {
          this.emit('log', `Sony live view: Waiting for camera to start streaming (Status 404, attempt ${this.sony404Count})...`);
        }
        if (this.isStreaming && !this.isCapturing) {
          this.sonyLiveViewTimer = setTimeout(() => this.runSonyPreviewLoop(), 1500); // Poll every 1.5s to let the camera initialize without lock contention
        }
      } else {
        this.emit('log', `Sony live view HTTP status error: ${res.statusCode}`);
        handleNetworkError(`HTTP ${res.statusCode}`);
        if (this.isStreaming && !this.isCapturing) {
          this.sonyLiveViewTimer = setTimeout(() => this.runSonyPreviewLoop(), 200);
        }
      }
    });

    req.on('error', (err) => {
      this.emit('log', `Sony live view frame request error: ${err.message}`);
      handleNetworkError(err.message);
      if (this.isStreaming && !this.isCapturing) {
        this.sonyLiveViewTimer = setTimeout(() => this.runSonyPreviewLoop(), 500);
      }
    });

    req.on('timeout', () => {
      this.emit('log', 'Sony live view frame request timed out');
      handleNetworkError('Timeout');
      req.destroy();
    });

    req.end();
  }

  async capturePhoto() {
    this.isCapturing = true;
    const wasStreaming = this.isStreaming;

    if (wasStreaming) {
      this.emit('log', 'Pausing live view for Sony capture...');
      if (this.sonyLiveViewTimer) {
        clearTimeout(this.sonyLiveViewTimer);
        this.sonyLiveViewTimer = null;
      }
      await this.stopSonyLiveViewApi();
      await new Promise(r => setTimeout(r, 200)); // wait for camera to settle
    }

    if (!fs.existsSync(this.sonyTempDir)) {
      fs.mkdirSync(this.sonyTempDir, { recursive: true });
    }

    const resumeLiveView = async () => {
      this.isCapturing = false;
      if (wasStreaming) {
        this.emit('log', 'Resuming live view for Sony...');
        await this.startSonyLiveViewApi();
        this.runSonyPreviewLoop();
      }
    };

    try {
      // 1. Get SD card file count before capture (to detect new file)
      let fileCountBefore = 0;
      try {
        const listRes = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/sd-card/slot/1/files`, {
          signal: AbortSignal.timeout(5000)
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          fileCountBefore = listData.file_count || 0;
        }
      } catch (err) {
        this.emit('log', `Warning: Could not get SD card file count before capture: ${err.message}`);
      }

      // 2. Trigger capture command (af-shutter)
      this.emit('log', 'Triggering Sony capture via REST API...');
      const captureRes = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/actions/af-shutter`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000)
      });

      if (!captureRes.ok) {
        await resumeLiveView();
        throw new Error(`Sony capture API status: ${captureRes.status}`);
      }

      // 3. Wait for camera to write file to SD card
      this.emit('log', 'Waiting for camera to write photo to SD card...');
      await new Promise(r => setTimeout(r, 2000));

      // 4. Poll SD card until new file appears (max 15 seconds)
      let latestFile = null;
      const maxPollAttempts = 13; // ~15 seconds total (2s initial wait + 13 polls * 1s)
      for (let i = 0; i < maxPollAttempts; i++) {
        try {
          const listRes = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/sd-card/slot/1/files`, {
            signal: AbortSignal.timeout(5000)
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            const files = listData.files || [];
            if (files.length > fileCountBefore) {
              latestFile = files[files.length - 1];
              this.emit('log', `New photo detected on SD card: ${latestFile.file_path} (${files.length} files total)`);
              break;
            }
          }
        } catch (err) {
          // Ignore polling errors
        }
        if (i < maxPollAttempts - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!latestFile) {
        await resumeLiveView();
        throw new Error('Sony capture timeout: No new file detected on SD card');
      }

      // 5. Download the file from SD card to local temp directory
      const savePath = path.normalize(this.sonyTempDir) + path.sep;
      this.emit('log', `Downloading photo from SD card to: ${savePath}`);

      // Set up file watcher to detect when the download is complete
      const downloadedFilePath = await new Promise(async (resolve, reject) => {
        const downloadTimeout = setTimeout(() => {
          if (fileWatcher) fileWatcher.close();
          reject(new Error('Sony download timeout: File did not appear in temp directory'));
        }, 20000);

        const existingFiles = new Set(fs.readdirSync(this.sonyTempDir));
        let fileWatcher = null;

        fileWatcher = fs.watch(this.sonyTempDir, async (eventType, filename) => {
          if (eventType === 'rename' && filename) {
            const ext = path.extname(filename).toLowerCase();
            if ((ext === '.jpg' || ext === '.jpeg' || ext === '.arw') && !existingFiles.has(filename)) {
              const fullPath = path.join(this.sonyTempDir, filename);
              // Wait for file to be completely written
              await new Promise(r => setTimeout(r, 500));
              if (fs.existsSync(fullPath)) {
                clearTimeout(downloadTimeout);
                if (fileWatcher) fileWatcher.close();
                resolve(fullPath);
              }
            }
          }
        });

        try {
          const downloadRes = await fetch(
            `http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/sd-card/slot/1/files/${latestFile.content_id}/${latestFile.file_id}/download`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ save_path: savePath }),
              signal: AbortSignal.timeout(15000)
            }
          );
          if (!downloadRes.ok) {
            const errText = await downloadRes.text().catch(() => 'No response body');
            this.emit('log', `Warning: Sony SD card download request failed (Status: ${downloadRes.status}, Error: ${errText}).`);
            // Don't reject yet - the file watcher might still detect the file
          } else {
            this.emit('log', 'Sony SD card download request accepted.');
          }
        } catch (err) {
          this.emit('log', `Warning: Sony SD card download request error: ${err.message}`);
        }
      });

      this.emit('log', `Sony photo downloaded successfully: ${downloadedFilePath}`);
      await resumeLiveView();
      return downloadedFilePath;

    } catch (err) {
      await resumeLiveView();
      throw err;
    }
  }

  async startRecording() {
    if (!this.sonyCameraId) return;
    this.emit('log', 'Starting Sony video recording...');
    try {
      const res = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/actions/movie-rec`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        this.emit('log', 'Sony video recording started.');
      } else {
        this.emit('log', `Failed to start Sony video recording: ${res.status}`);
      }
    } catch (err) {
      this.emit('log', `Error starting Sony video recording: ${err.message}`);
    }
  }

  async stopRecording() {
    if (!this.sonyCameraId) return null;
    this.emit('log', 'Stopping Sony video recording...');
    
    // We will watch the temp folder for the new video file
    return new Promise(async (resolve, reject) => {
      const timeoutDuration = 20000;
      let fileWatcher = null;
      
      const cleanup = () => {
        if (fileWatcher) {
          fileWatcher.close();
        }
        clearTimeout(timeoutTimer);
      };

      const timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error('Sony video capture timeout (No video file detected in temp folder)'));
      }, timeoutDuration);

      // List existing files to ignore them
      const existingFiles = new Set(fs.readdirSync(this.tempDir));

      // Watch for the video file (.mp4)
      fileWatcher = fs.watch(this.tempDir, async (eventType, filename) => {
        if (eventType === 'rename' && filename) {
          const ext = path.extname(filename).toLowerCase();
          if (ext === '.mp4' && !existingFiles.has(filename)) {
            const fullPath = path.join(this.tempDir, filename);
            
            // Wait to ensure file is written
            await new Promise(r => setTimeout(r, 1000));
            
            if (fs.existsSync(fullPath)) {
              this.emit('log', `New Sony video file detected: ${fullPath}`);
              cleanup();
              resolve(fullPath);
            }
          }
        }
      });

      try {
        // Trigger stop recording
        const res = await fetch(`http://127.0.0.1:8080/api/cameras/${this.sonyCameraId}/actions/movie-rec`, {
          method: 'POST',
          signal: AbortSignal.timeout(3000)
        });
        
        if (!res.ok) {
          cleanup();
          reject(new Error(`Failed to stop Sony video recording: ${res.status}`));
        }
      } catch (err) {
        cleanup();
        reject(new Error(`Error stopping Sony video recording: ${err.message}`));
      }
    });
  }

  cleanup() {
    this.stopLiveView();
    this.stopSonyServer();
  }
}

module.exports = SonyDriver;
