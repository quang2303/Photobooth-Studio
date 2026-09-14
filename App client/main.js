// Apply spawn patching first to auto-respond to interactive prompts in Sony SDK
require('./src/utils/spawn-patch').applySpawnPatch();
require('dotenv').config();

const { app, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import services and managers
const config = require('./src/main/services/config');
const socketClient = require('./src/main/socket-client');
const windowManager = require('./src/main/window-manager');
const CameraManager = require('./src/main/camera/CameraManager');
const frameManager = require('./src/main/services/frame-manager');
const { compositeFrame } = require('./src/main/services/image-processor');
const { downloadFile, uploadLocalVideo } = require('./src/main/services/uploader');
const googleDriveService = require('./src/main/services/googleDriveService');
const tempCleaner = require('./src/main/services/temp-cleaner');
const { registerIpc } = require('./src/main/ipc-router');

const cameraManager = new CameraManager();

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
} else {
  app.on('second-instance', () => {
    windowManager.showWindow();
  });
}

// Core Capture Sequence Orchestrator
let captureResolver = null;

async function triggerShutterAndProcess(overrideOverlayPath) {
  const cfg = config.get();
  let photoInput = null;
  let outputPath = null;
  let isTempOutput = false;

  try {
    // 1. Trigger camera capture
    if (cfg.cameraSource === 'webcam') {
      photoInput = await new Promise((resolve, reject) => {
        captureResolver = resolve;
        windowManager.sendToRenderer('webcam-capture-trigger');
        
        // Timeout after 8 seconds
        setTimeout(() => {
          if (captureResolver === resolve) {
            captureResolver = null;
            reject(new Error('Webcam capture timeout'));
          }
        }, 8000);
      });
    } else {
      photoInput = await cameraManager.captureHighResPhoto();
    }

    if (!photoInput) {
      throw new Error('No photo capture input received');
    }

    // 2. Determine storage mode & paths
    const storageMode = cfg.storageMode || 'local';
    const isFrameActive = cfg.frameEnabled !== false;
    let overlayPath = null;
    if (isFrameActive) {
      overlayPath = overrideOverlayPath || cfg.frameOverlayPath || frameManager.currentOverlayPath;
      if (overlayPath && !fs.existsSync(overlayPath)) {
        overlayPath = null;
      }
    }
    const processedFilename = `photo_${Date.now()}.jpg`;

    if (storageMode === 'local' || storageMode === 'both') {
      // Permanent local album directory (organized by date: Pictures/PhotoBooth/YYYY-MM-DD/)
      const todayStr = new Date().toISOString().slice(0, 10);
      const baseAlbumDir = cfg.localSavePath || path.join(app.getPath('pictures'), 'PhotoBooth');
      const localDir = path.join(baseAlbumDir, todayStr);
      await fs.promises.mkdir(localDir, { recursive: true });
      outputPath = path.join(localDir, processedFilename);
    } else {
      // Google Drive only: Save to temporary folder for composite & upload, not keeping in permanent local album
      const tempDir = path.join(app.getPath('userData'), 'temp_kiosk_photos');
      await fs.promises.mkdir(tempDir, { recursive: true });
      outputPath = path.join(tempDir, processedFilename);
      isTempOutput = true;
    }

    if (overlayPath && fs.existsSync(overlayPath)) {
      windowManager.sendToRenderer('log', `Processing photo. Overlay template: ${path.basename(overlayPath)} [Ratio: ${cfg.frameAspectRatio || '3:2'}]`);
      await compositeFrame(photoInput, overlayPath, outputPath);
    } else {
      windowManager.sendToRenderer('log', `No overlay template applied. Saving original photo.`);
      if (Buffer.isBuffer(photoInput)) {
        await fs.promises.writeFile(outputPath, photoInput);
      } else {
        await fs.promises.copyFile(photoInput, outputPath);
      }
    }

    if (!isTempOutput) {
      windowManager.sendToRenderer('log', `✅ [Lưu Local] Ảnh đã lưu an toàn tại máy: ${outputPath}`);
    }

    // Clean up raw capture photo file immediately after composite to free disk space
    if (typeof photoInput === 'string') {
      tempCleaner.safeDeleteFile(photoInput);
    }

    // Clean up temporary downloaded overlay file
    if (overrideOverlayPath && fs.existsSync(overrideOverlayPath)) {
      try {
        fs.unlinkSync(overrideOverlayPath);
      } catch (e) {}
    }

    // 3. Upload processed photo to Google Drive IF mode is 'gdrive' or 'both'
    let googleDriveInfo = null;
    let qrCodeDataUrl = '';

    if (storageMode === 'gdrive' || storageMode === 'both') {
      const buffer = await fs.promises.readFile(outputPath);
      try {
        windowManager.sendToRenderer('log', `☁️ Đang tải ảnh lên Google Drive: ${processedFilename}...`);
        const result = await googleDriveService.uploadPhoto(buffer, processedFilename);
        windowManager.sendToRenderer('log', `✅ [Lưu Drive] Đã tải lên Google Drive thành công! File ID: ${result.googleDriveFileId}`);
        
        googleDriveInfo = {
          googleDriveFileId: result.googleDriveFileId,
          webViewLink: result.webViewLink,
          downloadLink: result.downloadLink
        };

        const qrTarget = result.downloadLink || result.webViewLink;
        if (qrTarget) {
          try {
            const QRCode = require('qrcode');
            qrCodeDataUrl = await QRCode.toDataURL(qrTarget, { width: 300, margin: 1 });
          } catch (qrErr) {
            console.error('[QR] Failed to generate QR data URL:', qrErr);
          }
        }
      } catch (uploadErr) {
        windowManager.sendToRenderer('log', `⚠️ Không thể tải lên Google Drive: ${uploadErr.message}`);
        // If mode was gdrive only and upload failed, emergency fallback: save to permanent local disk so photo isn't lost!
        if (isTempOutput) {
          try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const baseAlbumDir = cfg.localSavePath || path.join(app.getPath('pictures'), 'PhotoBooth');
            const localDir = path.join(baseAlbumDir, todayStr);
            await fs.promises.mkdir(localDir, { recursive: true });
            const rescuePath = path.join(localDir, processedFilename);
            await fs.promises.copyFile(outputPath, rescuePath);
            outputPath = rescuePath;
            isTempOutput = false;
            windowManager.sendToRenderer('log', `💾 [Khẩn cấp] Đã tự động sao lưu ảnh vào máy tính: ${rescuePath}`);
          } catch (e) {}
        }
      }
    } else {
      windowManager.sendToRenderer('log', `📁 [Chế độ: Chỉ lưu Local] Không tải lên Google Drive.`);
    }

    const photoPayload = {
      localPath: outputPath,
      downloadLink: googleDriveInfo ? googleDriveInfo.downloadLink : null,
      webViewLink: googleDriveInfo ? googleDriveInfo.webViewLink : null,
      qrCodeDataUrl: qrCodeDataUrl,
      storageMode: storageMode
    };

    // Notify both dashboard and kiosk window
    windowManager.sendToAll('photo-uploaded', photoPayload);
    windowManager.sendToAll('kiosk-photo-ready', photoPayload);

    // 4. Clean up temporary photo if it was Google Drive only (keep temp file around briefly for kiosk display)
    if (isTempOutput) {
      setTimeout(() => {
        tempCleaner.safeDeleteFile(outputPath);
      }, ((cfg.kioskAutoResetDelay || 15) + 5) * 1000);
    }

    // 4. Upload photo to server via Socket.IO if enabled
    if (socketClient.isConnected() && cfg.enableServerSync) {
      windowManager.sendToRenderer('log', `Uploading photo to Cloud Server: ${processedFilename}...`);
      socketClient.uploadPhoto(cfg.roomName, processedFilename, buffer, googleDriveInfo);
    }

  } catch (err) {
    windowManager.sendToRenderer('log', `Error capturing / processing image: ${err.message}`);
    windowManager.sendToAll('kiosk-capture-error', err.message);
    if (typeof photoInput === 'string') {
      tempCleaner.safeDeleteFile(photoInput);
    }
    if (outputPath) {
      tempCleaner.safeDeleteFile(outputPath);
    }
    if (overrideOverlayPath && fs.existsSync(overrideOverlayPath)) {
      try {
        fs.unlinkSync(overrideOverlayPath);
      } catch (e) {}
    }
  }
}

// Register Socket Client Listeners
socketClient.on('status-change', (status) => {
  windowManager.sendToRenderer('server-status', status);
});

socketClient.on('log', (msg) => {
  windowManager.sendToRenderer('log', msg);
});

socketClient.on('start-stream', () => {
  const cfg = config.get();
  if (cfg.cameraSource === 'webcam') {
    windowManager.sendToRenderer('webcam-start-stream');
  }
});

socketClient.on('stop-stream', () => {
  const cfg = config.get();
  if (cfg.cameraSource === 'webcam') {
    windowManager.sendToRenderer('webcam-stop-stream');
  }
});

socketClient.on('remote-capture', async (data) => {
  let tempOverlayPath = '';
  const cfg = config.get();
  if (data && data.overlayUrl) {
    try {
      const fullOverlayUrl = data.overlayUrl.startsWith('http') 
        ? data.overlayUrl 
        : `${cfg.serverUrl.replace(/\/$/, '')}${data.overlayUrl}`;
        
      tempOverlayPath = path.join(cameraManager.tempDir, `room_overlay_${Date.now()}.png`);
      windowManager.sendToRenderer('log', `Downloading custom room overlay from: ${fullOverlayUrl}`);
      await downloadFile(fullOverlayUrl, tempOverlayPath);
    } catch (err) {
      windowManager.sendToRenderer('log', `Failed to download custom room overlay: ${err.message}. Using default.`);
      tempOverlayPath = '';
    }
  }
  triggerShutterAndProcess(tempOverlayPath);
});

socketClient.on('remote-video', async (data) => {
  const { action } = data;
  const cfg = config.get();
  if (cfg.cameraSource === 'dslr_sony') {
    if (action === 'start') {
      windowManager.sendToRenderer('log', 'Starting Sony video recording...');
      await cameraManager.startSonyVideoRecording();
    } else if (action === 'stop') {
      windowManager.sendToRenderer('log', 'Stopping Sony video recording and preparing upload...');
      const videoPath = await cameraManager.stopSonyVideoRecording();
      if (videoPath) {
        await uploadLocalVideo(videoPath, cfg.roomName, cfg.serverUrl, (msg) => {
          windowManager.sendToRenderer('log', msg);
        });
      } else {
        windowManager.sendToRenderer('log', 'Error: No video path returned from stopSonyVideoRecording.');
      }
    }
  }
});

// App Lifecycle
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const currentConfig = config.load();

  // Initialize and verify default frame layers and overlay
  if (!currentConfig.frameLayers || currentConfig.frameLayers.length === 0) {
    frameManager.ensureSampleLayer().then(async (sampleLayer) => {
      const initLayers = [sampleLayer];
      const targetRatio = currentConfig.frameAspectRatio || '3:2';
      const overlayPath = await frameManager.renderCompositeOverlay(initLayers, targetRatio);
      config.save({
        frameLayers: initLayers,
        frameAspectRatio: targetRatio,
        frameOverlayPath: overlayPath,
        frameEnabled: true
      });
      windowManager.sendToAll('overlay-updated', {
        overlayPath,
        aspectRatio: targetRatio,
        enabled: true,
        layers: initLayers
      });
    }).catch(e => console.warn('[Main] Sample frame layer init error:', e));
  } else if (!currentConfig.frameOverlayPath || !fs.existsSync(currentConfig.frameOverlayPath)) {
    frameManager.renderCompositeOverlay(currentConfig.frameLayers, currentConfig.frameAspectRatio || '3:2')
      .then(overlayPath => {
        config.save({ frameOverlayPath: overlayPath });
        windowManager.sendToAll('overlay-updated', {
          overlayPath,
          aspectRatio: currentConfig.frameAspectRatio || '3:2',
          enabled: currentConfig.frameEnabled !== false,
          layers: currentConfig.frameLayers
        });
      }).catch(e => console.warn('[Main] Frame render error:', e));
  }

  // 1. Setup camera event listeners early
  cameraManager.on('log', (msg) => {
    console.log(`[Camera] ${msg}`);
    windowManager.sendToRenderer('log', `[Camera] ${msg}`);
  });

  cameraManager.on('camera_connected', (camera) => {
    const cfg = config.get();
    if (cfg.cameraSource !== 'webcam') {
      windowManager.sendToRenderer('camera-connected', camera);
      windowManager.sendToRenderer('log', `Camera connected: ${camera.model} on port ${camera.port}`);
      cameraManager.startLiveViewStream();
    }
  });

  cameraManager.on('camera_disconnected', () => {
    const cfg = config.get();
    if (cfg.cameraSource !== 'webcam') {
      windowManager.sendToRenderer('camera-disconnected');
      windowManager.sendToRenderer('log', 'Camera disconnected.');
    }
  });

  cameraManager.on('frame', (frameBuffer) => {
    windowManager.sendToAll('local-frame', frameBuffer);
    const cfg = config.get();
    if (cfg.enableServerSync) {
      socketClient.sendFrame(cfg.roomName, frameBuffer);
    }
  });

  // 2. Create primary window IMMEDIATELY
  windowManager.createWindow(currentConfig);
  windowManager.showWindow();

  // 3. Register IPC interface so renderer can immediately communicate
  registerIpc({
    onRendererReady: () => {
      console.log(`[Main] Renderer ready event received. cameraConnected = ${cameraManager.cameraConnected}, model = ${cameraManager.detectedModel}`);
      const cfg = config.get();
      // Send configuration first
      windowManager.sendToRenderer('config', cfg);

      // Send WebSocket connection status
      windowManager.sendToRenderer('server-status', {
        connected: socketClient.isConnected(),
        message: socketClient.isConnected() ? 'Connected' : 'Disconnected'
      });

      // Send camera connection status
      if (cfg.cameraSource === 'webcam') {
        windowManager.sendToRenderer('camera-connected', {
          model: 'System Webcam',
          port: 'webcam'
        });
      } else {
        if (cameraManager.cameraConnected) {
          windowManager.sendToRenderer('camera-connected', {
            model: cameraManager.detectedModel,
            port: cfg.cameraSource === 'dslr_canon' ? 'canon-edsdk' : (cfg.cameraSource === 'dslr_sony' ? 'sony-usb' : 'webcam')
          });
          windowManager.sendToRenderer('log', `Camera connected: ${cameraManager.detectedModel}`);
        } else {
          windowManager.sendToRenderer('camera-disconnected');
        }
      }
    },
    onUpdateConfig: (event, newConfig) => {
      const cfg = config.get();
      const urlChanged = cfg.serverUrl !== newConfig.serverUrl;
      const licenseChanged = cfg.licenseKey !== newConfig.licenseKey;
      const roomNameChanged = cfg.roomName !== newConfig.roomName;
      const sourceChanged = cfg.cameraSource !== newConfig.cameraSource;
      const syncChanged = cfg.enableServerSync !== newConfig.enableServerSync;

      const updatedConfig = config.save(newConfig);
      event.reply('config', updatedConfig);

      if (urlChanged || licenseChanged || roomNameChanged || sourceChanged || syncChanged) {
        windowManager.sendToRenderer('log', 'Cloud Server URL, License Key, Room Name, Camera Source, or Sync toggle changed. Reconnecting WebSocket...');
        socketClient.connect(
          updatedConfig.serverUrl,
          updatedConfig.licenseKey,
          updatedConfig.roomName,
          updatedConfig.cameraSource,
          updatedConfig.enableServerSync
        );
      }

      if (sourceChanged) {
        cameraManager.setSource(updatedConfig.cameraSource);
        if (updatedConfig.cameraSource === 'webcam') {
          windowManager.sendToRenderer('camera-connected', { model: 'System Webcam', port: 'webcam' });
          windowManager.sendToKiosk('camera-connected', { model: 'System Webcam', port: 'webcam' });
        } else {
          windowManager.sendToRenderer('log', `Switching to ${updatedConfig.cameraSource}...`);
          if (cameraManager.cameraConnected) {
            windowManager.sendToRenderer('camera-connected', {
              model: cameraManager.detectedModel,
              port: updatedConfig.cameraSource === 'dslr_canon' ? 'canon-edsdk' : (updatedConfig.cameraSource === 'dslr_sony' ? 'sony-usb' : 'webcam')
            });
            windowManager.sendToKiosk('camera-connected', {
              model: cameraManager.detectedModel,
              port: updatedConfig.cameraSource
            });
            cameraManager.startLiveViewStream();
          }
        }
      }

      windowManager.sendToRenderer('log', 'Configuration saved.');
      windowManager.sendToKiosk('config', updatedConfig);
    },
    onKioskReady: () => {
      const cfg = config.get();
      windowManager.sendToKiosk('config', cfg);
      windowManager.sendToKiosk('overlay-updated', {
        overlayPath: cfg.frameOverlayPath,
        aspectRatio: cfg.frameAspectRatio || '3:2',
        enabled: cfg.frameEnabled !== false,
        layers: cfg.frameLayers || []
      });
      if (cfg.cameraSource === 'webcam') {
        windowManager.sendToKiosk('camera-connected', { model: 'System Webcam', port: 'webcam' });
      } else if (cameraManager.cameraConnected) {
        windowManager.sendToKiosk('camera-connected', { model: cameraManager.detectedModel, port: cfg.cameraSource });
      }
    },
    onOpenKiosk: () => {
      windowManager.createKioskWindow();
    },
    onCloseKiosk: () => {
      windowManager.closeKioskWindow();
    },
    onToggleKiosk: () => {
      windowManager.toggleKioskWindow();
    },
    onSetKioskFullscreen: (flag) => {
      windowManager.setKioskFullScreen(flag);
    },
    onKioskTriggerCapture: () => {
      triggerShutterAndProcess();
    },
    onTriggerCapture: () => {
      triggerShutterAndProcess();
    },
    onOpenLocalFolder: () => {
      const cfg = config.get();
      const todayStr = new Date().toISOString().slice(0, 10);
      const baseAlbumDir = cfg.localSavePath || path.join(app.getPath('pictures'), 'PhotoBooth');
      const todayDir = path.join(baseAlbumDir, todayStr);
      const targetDir = fs.existsSync(todayDir) ? todayDir : baseAlbumDir;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      shell.openPath(targetDir);
    },
    onStartGoogleAuth: async () => {
      try {
        await googleDriveService.startOAuthLogin();
        const status = await googleDriveService.getAccountStatus();
        windowManager.sendToRenderer('google-auth-status', status);
        return { success: true, ...status };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    onDisconnectGoogleAuth: async () => {
      googleDriveService.disconnectAccount();
      const status = await googleDriveService.getAccountStatus();
      windowManager.sendToRenderer('google-auth-status', status);
      return { success: true };
    },
    onGetGoogleAuthStatus: async () => {
      return await googleDriveService.getAccountStatus();
    },
    onOpenAdminPage: () => {
      const cfg = config.get();
      const deviceId = (cfg.cameraSource === 'webcam')
        ? 'webcam-' + os.hostname()
        : (cfg.cameraSource === 'dslr_canon' ? 'canon-' : 'sony-') + process.platform + '-' + os.hostname();
      const adminUrl = `${cfg.serverUrl}/admin.html?localDeviceId=${deviceId}`;
      shell.openExternal(adminUrl);
    },
    onOpenRoomPage: () => {
      const cfg = config.get();
      const roomName = cfg.roomName || 'default-room';
      const roomUrl = `${cfg.serverUrl}/room.html?room=${roomName}`;
      shell.openExternal(roomUrl);
    },
    onNotifyWebcamConnected: () => {
      const cfg = config.get();
      if (cfg.cameraSource === 'webcam') {
        windowManager.sendToAll('camera-connected', { model: 'System Webcam', port: 'webcam' });
        windowManager.sendToRenderer('log', 'Webcam connected and ready.');

        if (socketClient.isConnected()) {
          const deviceId = 'webcam-' + os.hostname();
          socketClient.socket.emit('register-device', { licenseKey: cfg.licenseKey, deviceId, roomName: cfg.roomName || 'default-room' });
        }
      }
    },
    onNotifyWebcamDisconnected: () => {
      const cfg = config.get();
      if (cfg.cameraSource === 'webcam') {
        windowManager.sendToAll('camera-disconnected');
        windowManager.sendToRenderer('log', 'Webcam disconnected.');
      }
    },
    onWebcamFrame: (event, arrayBuffer) => {
      const cfg = config.get();
      if (cfg.enableServerSync) {
        socketClient.sendFrame(cfg.roomName, Buffer.from(arrayBuffer));
      }
    },
    onWebcamCapturedImage: (event, dataUrl) => {
      if (captureResolver) {
        try {
          const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          
          const resolve = captureResolver;
          captureResolver = null;
          resolve(buffer);
        } catch (err) {
          console.error('Failed to parse webcam captured image:', err);
          const resolve = captureResolver;
          captureResolver = null;
          resolve(null);
        }
      }
    },
    onStartCameraVideo: async () => {
      const cfg = config.get();
      if (cfg.cameraSource === 'dslr_sony') {
        await cameraManager.startSonyVideoRecording();
        return true;
      }
      return false;
    },
    onStopCameraVideo: async () => {
      const cfg = config.get();
      if (cfg.cameraSource === 'dslr_sony') {
        const videoPath = await cameraManager.stopSonyVideoRecording();
        return videoPath;
      }
      return null;
    },
    onOpenLayerDialog: async () => {
      const result = await dialog.showOpenDialog({
        title: 'Chọn Ảnh Layer (Khung viền, Logo, Watermark)',
        filters: [
          { name: 'Ảnh Khung & Logo', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
        ],
        properties: ['openFile']
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    },
    onImportLayerFile: async (sourcePath) => {
      try {
        const layer = await frameManager.importLayerFile(sourcePath);
        return { success: true, layer };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    onDeleteLayerFile: async (fileNameOrPath) => {
      try {
        await frameManager.deleteLayerFile(fileNameOrPath);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    onSaveFrameConfig: async (data) => {
      try {
        const cfg = config.get();
        const layers = data.layers || [];
        const aspectRatio = data.aspectRatio || cfg.frameAspectRatio || '3:2';
        const enabled = data.enabled !== undefined ? !!data.enabled : cfg.frameEnabled !== false;

        let overlayPath = '';
        if (layers.length > 0) {
          overlayPath = await frameManager.renderCompositeOverlay(layers, aspectRatio);
        }

        const updatedConfig = config.save({
          frameLayers: layers,
          frameAspectRatio: aspectRatio,
          frameEnabled: enabled,
          frameOverlayPath: overlayPath
        });

        windowManager.sendToAll('overlay-updated', {
          overlayPath,
          aspectRatio,
          enabled,
          layers
        });
        windowManager.sendToAll('config', updatedConfig);
        windowManager.sendToRenderer('log', `Đã lưu cấu hình khung ảnh: ${layers.length} layers, tỷ lệ ${aspectRatio}.`);

        return { success: true, overlayPath, config: updatedConfig };
      } catch (err) {
        console.error('Save frame config error:', err);
        return { success: false, error: err.message };
      }
    },
    onGetFrameConfig: async () => {
      const cfg = config.get();
      return {
        layers: cfg.frameLayers || [],
        aspectRatio: cfg.frameAspectRatio || '3:2',
        enabled: cfg.frameEnabled !== false,
        overlayPath: cfg.frameOverlayPath || ''
      };
    },
    onToggleFrameEnabled: async (enabled) => {
      const isEnabled = !!enabled;
      const cfg = config.save({ frameEnabled: isEnabled });
      windowManager.sendToAll('overlay-updated', {
        overlayPath: cfg.frameOverlayPath,
        aspectRatio: cfg.frameAspectRatio || '3:2',
        enabled: isEnabled,
        layers: cfg.frameLayers || []
      });
      windowManager.sendToAll('config', cfg);
      windowManager.sendToRenderer('log', isEnabled ? 'Đã bật ghép khung ảnh.' : 'Đã tắt ghép khung ảnh.');
      return { success: true, enabled: isEnabled };
    },
    onGetBuiltinTemplates: async () => {
      try {
        return frameManager.getBuiltinTemplates();
      } catch (err) {
        console.error('[Main] getBuiltinTemplates error:', err);
        return [];
      }
    },
    onApplyBuiltinTemplate: async (templateId) => {
      try {
        const result = await frameManager.applyBuiltinTemplate(templateId);
        if (result && result.success) {
          const updatedConfig = config.save({
            frameLayers: result.layers,
            frameAspectRatio: result.aspectRatio,
            frameEnabled: true,
            frameOverlayPath: result.overlayPath
          });

          windowManager.sendToAll('overlay-updated', {
            overlayPath: result.overlayPath,
            aspectRatio: result.aspectRatio,
            enabled: true,
            layers: result.layers
          });
          windowManager.sendToAll('config', updatedConfig);
          windowManager.sendToRenderer('log', `Đã áp dụng mẫu khung: ${result.template.name} (${result.aspectRatio})`);
          return { success: true, ...result, config: updatedConfig };
        }
        return { success: false, error: 'Failed to apply template' };
      } catch (err) {
        console.error('[Main] onApplyBuiltinTemplate error:', err);
        return { success: false, error: err.message };
      }
    }
  });

  // 4. Background tasks (run in parallel, non-blocking for sub-second startup)
  socketClient.connect(
    currentConfig.serverUrl,
    currentConfig.licenseKey,
    currentConfig.roomName,
    currentConfig.cameraSource,
    currentConfig.enableServerSync
  );

  windowManager.ensureAssets().then(({ iconPath }) => {
    windowManager.createTray(iconPath, () => triggerShutterAndProcess());
  }).catch(err => console.error('Tray init error:', err));

  tempCleaner.cleanAllTempDirectories(cameraManager.tempDir, 0);
  tempCleaner.startPeriodicCleanup(cameraManager.tempDir, 15 * 60 * 1000, 5 * 60 * 1000);

  cameraManager.initialize().then(() => {
    if (currentConfig.cameraSource !== 'webcam') {
      cameraManager.setSource(currentConfig.cameraSource);
      cameraManager.startAutoDetect();
      if (cameraManager.cameraConnected) {
        cameraManager.startLiveViewStream();
      }
    }
  }).catch(err => console.error('Camera init error:', err));
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});

// Clean up processes and temp files on exit
app.on('will-quit', () => {
  tempCleaner.stopPeriodicCleanup();
  tempCleaner.cleanAllTempDirectories(cameraManager.tempDir, 0);
  cameraManager.cleanup();
  socketClient.disconnect();
});
