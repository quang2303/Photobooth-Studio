export class UIHelper {
  constructor() {
    this.cameraSourceSelect = document.getElementById('camera-source-select');
    this.webcamDeviceSelect = document.getElementById('webcam-device-select');
    this.webcamSelectGroup = document.getElementById('webcam-select-group');
    this.licenseInput = document.getElementById('license-input');
    this.serverInput = document.getElementById('server-input');
    this.roomInput = document.getElementById('room-input');
    this.overlayInput = document.getElementById('overlay-input');
    this.applyBtn = document.getElementById('apply-btn');
    this.captureBtn = document.getElementById('capture-btn');
    this.clearLogsBtn = document.getElementById('clear-logs-btn');
    this.languageSelect = document.getElementById('language-select');
    this.liveviewQualitySelect = document.getElementById('liveview-quality-select');
    this.storageModeSelect = document.getElementById('storage-mode-select');

    this.cameraCard = document.getElementById('camera-status-card');
    this.cameraStatusText = document.getElementById('camera-status-text');
    this.cloudCard = document.getElementById('cloud-status-card');
    this.cloudStatusText = document.getElementById('cloud-status-text');

    this.liveviewImg = document.getElementById('liveview-image');
    this.webcamVideo = document.getElementById('webcam-video');
    this.webcamCanvas = document.getElementById('webcam-canvas');
    this.liveviewPlaceholder = document.getElementById('liveview-placeholder');
    this.consoleLogs = document.getElementById('console-logs');

    // Kiosk & Google Drive Elements
    this.btnOpenKiosk = document.getElementById('btn-open-kiosk');
    this.gdriveEmail = document.getElementById('gdrive-email');
    this.gdriveQuotaBox = document.getElementById('gdrive-quota-box');
    this.gdriveQuotaText = document.getElementById('gdrive-quota-text');
    this.gdriveQuotaBar = document.getElementById('gdrive-quota-bar');
    this.btnGdriveConnect = document.getElementById('btn-gdrive-connect');
    this.btnGdriveDisconnect = document.getElementById('btn-gdrive-disconnect');
    this.openLocalPhotosBtn = document.getElementById('open-local-photos-btn');

    this.rendererFrameCount = 0;
  }

  updateGoogleDriveStatus(status) {
    if (!this.gdriveEmail) return;
    const indicator = document.getElementById('gdrive-indicator');

    if (status && status.connected) {
      if (indicator) indicator.className = 'account-status-dot drive-dot active';
      this.gdriveEmail.textContent = status.email || 'Đã kết nối';
      this.gdriveEmail.style.color = '#10b981';
      if (status.quota) {
        this.gdriveQuotaBox.style.display = 'block';
        this.gdriveQuotaText.textContent = `${status.quota.usageGB} GB / ${status.quota.limitGB} GB`;
        this.gdriveQuotaBar.style.width = `${Math.min(100, status.quota.percent)}%`;
        if (status.quota.percent > 90) {
          this.gdriveQuotaBar.style.background = '#f43f5e';
        } else {
          this.gdriveQuotaBar.style.background = 'linear-gradient(90deg, #06b6d4, #3b82f6)';
        }
      }
      if (this.btnGdriveConnect) this.btnGdriveConnect.textContent = 'Đổi Tài Khoản';
      if (this.btnGdriveDisconnect) {
        this.btnGdriveDisconnect.style.display = 'block';
        this.btnGdriveDisconnect.textContent = 'Ngắt';
      }
    } else {
      if (indicator) indicator.className = 'account-status-dot drive-dot';
      this.gdriveEmail.textContent = 'Chưa kết nối';
      this.gdriveEmail.style.color = '#94a3b8';
      if (this.gdriveQuotaBox) this.gdriveQuotaBox.style.display = 'none';
      if (this.btnGdriveConnect) this.btnGdriveConnect.textContent = 'Đăng Nhập Drive';
      if (this.btnGdriveDisconnect) this.btnGdriveDisconnect.style.display = 'none';
    }
  }

  updateConfigFields(config) {
    if (this.cameraSourceSelect) this.cameraSourceSelect.value = config.cameraSource || 'webcam';
    if (this.licenseInput) this.licenseInput.value = config.licenseKey || '';
    if (this.serverInput) this.serverInput.value = config.serverUrl || '';
    if (this.roomInput) this.roomInput.value = config.roomName || '';
    if (this.overlayInput) this.overlayInput.value = config.frameOverlayPath || '';
    if (this.liveviewQualitySelect) this.liveviewQualitySelect.value = config.liveViewQuality || 'high';
    if (this.storageModeSelect) this.storageModeSelect.value = config.storageMode || 'local';

    const storageStatusText = document.getElementById('storage-status-text');
    if (storageStatusText) {
      const mode = config.storageMode || 'local';
      storageStatusText.textContent = mode === 'local' ? 'Lưu Trên Máy (Local)' : (mode === 'gdrive' ? 'Lưu Google Drive (QR)' : 'Lưu Cả Hai (Local & Drive)');
    }
  }

  toggleWebcamSelectGroup(source) {
    if (this.webcamSelectGroup) {
      this.webcamSelectGroup.style.display = source === 'webcam' ? 'flex' : 'none';
    }
  }

  updateCameraStatus(connected, model, translations, currentLanguage) {
    console.log('[Renderer ui-helper.js] updateCameraStatus called, connected =', connected, 'model =', model);
    if (!this.cameraCard || !this.cameraStatusText) return;

    const dot = document.getElementById('camera-status-dot');
    if (connected) {
      this.cameraCard.className = 'metric-pill-card status-connected';
      this.cameraStatusText.removeAttribute('data-i18n');
      this.cameraStatusText.textContent = model || 'Camera Sẵn Sàng';
      if (dot) {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 10px #10b981';
      }
    } else {
      this.cameraCard.className = 'metric-pill-card status-disconnected';
      this.cameraStatusText.setAttribute('data-i18n', 'disconnected');
      this.cameraStatusText.textContent = translations[currentLanguage]?.disconnected || 'Chưa Kết Nối';
      if (dot) {
        dot.style.background = '#f43f5e';
        dot.style.boxShadow = '0 0 10px #f43f5e';
      }
    }
  }

  updateCloudStatus(status, translations, currentLanguage) {
    if (!this.cloudCard || !this.cloudStatusText) return;

    if (status.connected) {
      this.cloudCard.className = 'status-card status-connected';
      this.cloudStatusText.textContent = status.message || translations[currentLanguage]?.connected || 'Connected';
    } else {
      this.cloudCard.className = 'status-card status-disconnected';
      const msg = status.message || translations[currentLanguage]?.offline || 'Offline';
      
      // Map English messages to local language translations
      if (msg === 'Offline') {
        this.cloudStatusText.textContent = translations[currentLanguage]?.offline || 'Offline';
      } else if (msg === 'Disconnected') {
        this.cloudStatusText.textContent = translations[currentLanguage]?.disconnected || 'Disconnected';
      } else if (msg === 'Connection Error') {
        this.cloudStatusText.textContent = translations[currentLanguage]?.connectingError || 'Connection Error';
      } else {
        this.cloudStatusText.textContent = msg;
      }
    }
  }

  startLiveview() {
    if (this.cameraSourceSelect.value === 'webcam') {
      if (this.webcamVideo) this.webcamVideo.style.display = 'block';
      if (this.liveviewImg) this.liveviewImg.style.display = 'none';
      if (this.liveviewPlaceholder) this.liveviewPlaceholder.style.display = 'none';
    } else {
      if (this.liveviewImg) this.liveviewImg.style.display = 'block';
      if (this.webcamVideo) this.webcamVideo.style.display = 'none';
      if (this.liveviewPlaceholder) this.liveviewPlaceholder.style.display = 'none';
    }
  }

  stopLiveview() {
    if (this.cameraSourceSelect.value === 'webcam') {
      if (this.webcamVideo) {
        this.webcamVideo.style.display = 'none';
      }
    } else {
      if (this.liveviewImg) {
        const oldUrl = this.liveviewImg.src;
        this.liveviewImg.src = '';
        if (oldUrl && oldUrl.startsWith('blob:')) {
          URL.revokeObjectURL(oldUrl);
        }
        this.liveviewImg.style.display = 'none';
      }
    }
    if (this.liveviewPlaceholder) {
      this.liveviewPlaceholder.style.display = 'flex';
    }
  }

  renderLocalFrame(frameBuffer, isCameraConnected) {
    this.rendererFrameCount++;
    
    let cleanUint8Array;
    if (frameBuffer && frameBuffer.type === 'Buffer' && Array.isArray(frameBuffer.data)) {
      cleanUint8Array = new Uint8Array(frameBuffer.data);
    } else if (frameBuffer && frameBuffer.buffer instanceof ArrayBuffer) {
      cleanUint8Array = new Uint8Array(frameBuffer.buffer, frameBuffer.byteOffset, frameBuffer.byteLength);
    } else {
      cleanUint8Array = new Uint8Array(frameBuffer);
    }

    if (this.rendererFrameCount % 30 === 1) {
      console.log(`[Renderer Frame] Count: ${this.rendererFrameCount}, Type: ${frameBuffer ? typeof frameBuffer : 'null'}, Clean Size: ${cleanUint8Array.length} bytes`);
    }

    if (this.cameraSourceSelect.value !== 'webcam' && this.liveviewImg) {
      if (this.liveviewImg.style.display === 'none') {
        this.liveviewImg.style.display = 'block';
        if (this.webcamVideo) this.webcamVideo.style.display = 'none';
        if (this.liveviewPlaceholder) this.liveviewPlaceholder.style.display = 'none';
      }
      try {
        const blob = new Blob([cleanUint8Array], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        const oldUrl = this.liveviewImg.src;
        
        this.liveviewImg.src = url;
        if (oldUrl && oldUrl.startsWith('blob:')) {
          URL.revokeObjectURL(oldUrl);
        }
      } catch (e) {
        console.error('[Renderer UI] Error creating frame blob:', e);
      }
    }
  }

  bindEvents(callbacks = {}) {
    if (this.applyBtn) {
      this.applyBtn.addEventListener('click', () => {
        const config = {
          licenseKey: this.licenseInput.value.trim(),
          serverUrl: this.serverInput.value.trim(),
          roomName: this.roomInput.value.trim(),
          frameOverlayPath: this.overlayInput.value.trim(),
          cameraSource: this.cameraSourceSelect.value,
          language: this.languageSelect.value,
          webcamDeviceId: this.webcamDeviceSelect.value || '',
          liveViewQuality: this.liveviewQualitySelect.value
        };
        if (callbacks.onApply) callbacks.onApply(config);
      });
    }

    if (this.captureBtn) {
      this.captureBtn.addEventListener('click', () => {
        if (callbacks.onCapture) callbacks.onCapture();
      });
    }

    if (this.clearLogsBtn) {
      this.clearLogsBtn.addEventListener('click', () => {
        if (callbacks.onClearLogs) callbacks.onClearLogs();
      });
    }

    if (this.cameraSourceSelect) {
      this.cameraSourceSelect.addEventListener('change', (e) => {
        if (callbacks.onSourceChange) callbacks.onSourceChange(e.target.value);
      });
    }

    if (this.webcamDeviceSelect) {
      this.webcamDeviceSelect.addEventListener('change', (e) => {
        if (callbacks.onWebcamDeviceChange) callbacks.onWebcamDeviceChange(e.target.value);
      });
    }

    if (this.liveviewQualitySelect) {
      this.liveviewQualitySelect.addEventListener('change', (e) => {
        if (callbacks.onQualityChange) callbacks.onQualityChange(e.target.value);
      });
    }

    if (this.languageSelect) {
      this.languageSelect.addEventListener('change', (e) => {
        if (callbacks.onLanguageChange) callbacks.onLanguageChange(e.target.value);
      });
    }

    if (this.storageModeSelect) {
      this.storageModeSelect.addEventListener('change', (e) => {
        if (callbacks.onStorageModeChange) callbacks.onStorageModeChange(e.target.value);
      });
    }

    if (this.serverSyncToggle) {
      this.serverSyncToggle.addEventListener('change', () => {
        const currentConfigValues = this.getCurrentConfigValues();
        if (callbacks.onApply) callbacks.onApply(currentConfigValues);
      });
    }

    const openAdminBtn = document.getElementById('open-admin-btn');
    if (openAdminBtn) {
      openAdminBtn.addEventListener('click', () => {
        window.electronAPI.openAdminPage();
      });
    }

    const openRoomBtn = document.getElementById('open-room-btn');
    if (openRoomBtn) {
      openRoomBtn.addEventListener('click', () => {
        window.electronAPI.openRoomPage();
      });
    }

    if (this.btnOpenKiosk) {
      this.btnOpenKiosk.addEventListener('click', () => {
        window.electronAPI.toggleKioskWindow();
      });
    }

    if (this.openLocalPhotosBtn) {
      this.openLocalPhotosBtn.addEventListener('click', () => {
        window.electronAPI.openLocalFolder();
      });
    }

    if (this.btnGdriveConnect) {
      this.btnGdriveConnect.addEventListener('click', async () => {
        this.btnGdriveConnect.textContent = 'Đang mở trình duyệt...';
        try {
          const res = await window.electronAPI.startGoogleAuth();
          if (res.success) {
            this.updateGoogleDriveStatus(res);
          } else {
            alert('Lỗi đăng nhập: ' + (res.error || 'Thất bại'));
            this.btnGdriveConnect.textContent = 'Đăng Nhập Drive';
          }
        } catch (err) {
          alert('Lỗi: ' + err.message);
          this.btnGdriveConnect.textContent = 'Đăng Nhập Drive';
        }
      });
    }

    if (this.btnGdriveDisconnect) {
      this.btnGdriveDisconnect.addEventListener('click', async () => {
        if (confirm('Bạn có chắc muốn ngắt kết nối tài khoản Google Drive này?')) {
          await window.electronAPI.disconnectGoogleAuth();
          this.updateGoogleDriveStatus({ connected: false });
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI.toggleKioskWindow();
      }
    });
  }

  getCurrentConfigValues() {
    return {
      licenseKey: this.licenseInput.value.trim(),
      serverUrl: this.serverInput.value.trim(),
      roomName: this.roomInput.value.trim(),
      frameOverlayPath: this.overlayInput.value.trim(),
      cameraSource: this.cameraSourceSelect.value,
      language: this.languageSelect.value,
      webcamDeviceId: this.webcamDeviceSelect.value || '',
      liveViewQuality: this.liveviewQualitySelect.value,
      storageMode: this.storageModeSelect ? this.storageModeSelect.value : 'local',
      enableServerSync: false
    };
  }
}
