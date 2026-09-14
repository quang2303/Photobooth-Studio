const BaseDriver = require('./BaseDriver');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const BRIDGE_PORT = 5514;
const BRIDGE_HOST = '127.0.0.1';

function requestHttp(method, reqPath, postData = null, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: reqPath,
      method: method,
      agent: keepAliveAgent,
      timeout: timeoutMs,
      headers: {}
    };

    if (postData) {
      const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(dataStr);
    } else if (method === 'POST') {
      options.headers['Content-Length'] = 0;
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          body,
          json: () => {
            try { return JSON.parse(body); } catch (e) { return null; }
          }
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (postData) {
      const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      req.write(dataStr);
    }
    req.end();
  });
}

class CanonDriver extends BaseDriver {
  constructor(tempDir) {
    super();
    this.tempDir = tempDir;
    this.bridgeProcess = null;
    this.isStreaming = false;
    this.isCapturing = false;
    this.previewLoopTimer = null;
    this.cameraConnected = false;
    this.detectedModel = null;
  }

  getBridgeExePath() {
    const candidatePaths = [
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bridges', 'canon', 'CanonBridge.exe') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'bridges', 'canon', 'CanonBridge.exe') : '',
      path.join(process.cwd(), 'bridges', 'canon', 'CanonBridge.exe'),
      path.join(__dirname, '..', '..', '..', '..', 'bridges', 'canon', 'CanonBridge.exe'),
      (app && app.getAppPath && !app.isPackaged) ? path.join(app.getAppPath(), 'bridges', 'canon', 'CanonBridge.exe') : ''
    ];

    for (const p of candidatePaths) {
      if (p && !p.includes('.asar\\') && !p.includes('.asar/') && fs.existsSync(p)) {
        return p;
      }
    }
    if (process.resourcesPath) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'bridges', 'canon', 'CanonBridge.exe');
    }
    return candidatePaths[0];
  }

  async initialize() {
    this.emit('log', 'Canon Direct EDSDK Driver initialized.');
  }

  async startBridge() {
    if (this.bridgeProcess) return;

    // Check if bridge is already running on port 5514
    try {
      const res = await requestHttp('GET', '/status', null, 1000);
      if (res && res.ok) {
        this.emit('log', 'CanonBridge service already running on port 5514.');
        return;
      }
    } catch (e) {
      // Not running, proceed to spawn
    }

    const exePath = this.getBridgeExePath();
    if (!fs.existsSync(exePath)) {
      this.emit('log', `Error: CanonBridge.exe not found at: ${exePath}`);
      return;
    }

    const bridgeDir = path.dirname(exePath);
    this.emit('log', `Starting CanonBridge background service from: ${exePath}`);

    try {
      this.bridgeProcess = spawn(exePath, [], {
        cwd: bridgeDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.bridgeProcess.on('error', (err) => {
        this.emit('log', `CanonBridge process error: ${err.message}`);
        this.bridgeProcess = null;
      });

      this.bridgeProcess.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line) this.emit('log', line);
      });

      this.bridgeProcess.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) this.emit('log', `[CanonBridge Err] ${line}`);
      });

      this.bridgeProcess.on('exit', (code) => {
        this.emit('log', `CanonBridge service exited with code ${code}`);
        this.bridgeProcess = null;
      });

      // Wait up to 3 seconds for the HTTP server to respond
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
          const check = await requestHttp('GET', '/status', null, 500);
          if (check.ok) {
            this.emit('log', 'CanonBridge service ready on port 5514.');
            break;
          }
        } catch (err) {}
      }
    } catch (err) {
      this.emit('log', `Failed to start CanonBridge service: ${err.message}`);
      this.bridgeProcess = null;
    }
  }

  async stopBridge() {
    this.stopLiveView();

    try {
      await requestHttp('POST', '/shutdown', null, 1500);
    } catch (e) {}

    if (this.bridgeProcess) {
      try {
        this.bridgeProcess.kill();
      } catch (e) {}
      this.bridgeProcess = null;
    }
  }

  async detect() {
    // Ensure bridge service is running
    await this.startBridge();

    try {
      const res = await requestHttp('GET', '/status', null, 1500);
      if (!res.ok) return null;
      const data = res.json();
      if (data && data.connected && data.model && data.model !== 'No Camera') {
        this.cameraConnected = true;
        this.detectedModel = data.model;
        return {
          model: data.model,
          port: 'canon-edsdk',
          manufacturer: data.manufacturer || 'Canon',
          battery: data.battery || 0
        };
      }

      this.cameraConnected = false;
      this.detectedModel = null;
      return null;
    } catch (err) {
      return null;
    }
  }

  async startLiveView() {
    if (this.isStreaming || this.isCapturing) return;
    this.isStreaming = true;

    this.emit('log', 'Starting Canon direct EDSDK Live View stream...');
    try {
      await requestHttp('POST', '/liveview/start', null, 2000);
    } catch (err) {
      this.emit('log', `Warning starting liveview: ${err.message}`);
    }

    this.runLiveViewLoop();
  }

  stopLiveView() {
    if (!this.isStreaming) return;
    this.isStreaming = false;

    if (this.previewLoopTimer) {
      clearTimeout(this.previewLoopTimer);
      this.previewLoopTimer = null;
    }

    requestHttp('POST', '/liveview/stop', null, 1500).catch(() => {});
  }

  runLiveViewLoop() {
    if (!this.isStreaming || this.isCapturing) return;

    const options = {
      hostname: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: '/liveview',
      method: 'GET',
      agent: keepAliveAgent,
      timeout: 1000
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length > 0) {
            this.emit('frame', buffer);
          }
          // Schedule next frame (~30 FPS)
          if (this.isStreaming && !this.isCapturing) {
            this.previewLoopTimer = setTimeout(() => this.runLiveViewLoop(), 33);
          }
        });
      } else {
        // Consume and discard response body to free socket back to keepAliveAgent
        res.resume();
        // Retry after short delay if no frame ready
        if (this.isStreaming && !this.isCapturing) {
          this.previewLoopTimer = setTimeout(() => this.runLiveViewLoop(), 100);
        }
      }
    });

    req.on('error', () => {
      if (this.isStreaming && !this.isCapturing) {
        this.previewLoopTimer = setTimeout(() => this.runLiveViewLoop(), 300);
      }
    });

    req.on('timeout', () => {
      req.destroy();
    });

    req.end();
  }

  async capturePhoto() {
    if (this.isCapturing) {
      throw new Error('Capture already in progress');
    }

    this.isCapturing = true;
    const wasStreaming = this.isStreaming;

    if (wasStreaming) {
      this.emit('log', 'Pausing Live View for Canon capture...');
      if (this.previewLoopTimer) {
        clearTimeout(this.previewLoopTimer);
        this.previewLoopTimer = null;
      }
    }

    const filename = `canon_capture_${Date.now()}.jpg`;
    const targetFilePath = path.join(this.tempDir, filename);

    this.emit('log', `Triggering Canon EDSDK shutter, saving to: ${targetFilePath}...`);

    try {
      const queryPath = `/capture?savePath=${encodeURIComponent(targetFilePath)}`;
      const res = await requestHttp('POST', queryPath, null, 30000);

      if (!res.ok) {
        throw new Error(`Capture failed with HTTP ${res.statusCode}: ${res.body}`);
      }

      const data = res.json();
      if (!data || !data.success || !fs.existsSync(targetFilePath)) {
        throw new Error(data && data.error ? data.error : 'Captured photo file not found');
      }

      this.emit('log', `Canon EDSDK capture successful! Saved: ${targetFilePath}`);

      // Resume live view if active before
      if (wasStreaming && this.isStreaming) {
        setTimeout(() => {
          this.runLiveViewLoop();
        }, 500);
      }

      return targetFilePath;
    } catch (err) {
      this.emit('log', `Canon capture error: ${err.message}`);
      if (wasStreaming && this.isStreaming) {
        setTimeout(() => {
          this.runLiveViewLoop();
        }, 500);
      }
      throw err;
    } finally {
      this.isCapturing = false;
    }
  }

  cleanup() {
    this.stopLiveView();
    this.stopBridge();
  }
}

module.exports = CanonDriver;
