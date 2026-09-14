import { UIHelper } from './modules/ui-helper.js';
import { TranslationManager, translations } from './modules/i18n.js';
import { Logger } from './modules/logger.js';
import { WebcamStreamer } from './modules/webcam-streamer.js';
import { setupIpcListeners } from './modules/ipc-handler.js';
import { FrameEditor } from './modules/frame-editor.js';

// Initialize UI instances
const ui = new UIHelper();
const i18n = new TranslationManager();
const logger = new Logger(ui.consoleLogs);
const webcam = new WebcamStreamer();
const frameEditor = new FrameEditor();

let isCameraConnected = false;
let currentConfig = {};

// Helper to translate logs received from main process
function translateLogMessage(msg, lang) {
  if (lang !== 'vi') return msg;

  let translatedMsg = msg;
  if (msg.includes('Successfully connected to Cloud server.')) {
    translatedMsg = 'Kết nối thành công tới Cloud server.';
  } else if (msg.includes('Disconnected from Cloud server.')) {
    translatedMsg = 'Đã ngắt kết nối khỏi Cloud server.';
  } else if (msg.includes('WebSocket connection error:')) {
    translatedMsg = msg.replace('WebSocket connection error:', 'Lỗi kết nối WebSocket:');
  } else if (msg.includes('Remote capture command (server-command-capture) received.')) {
    translatedMsg = 'Đã nhận được lệnh chụp ảnh từ xa từ Cloud server.';
  } else if (msg.includes('Processed photo successfully uploaded to Cloud server.')) {
    translatedMsg = 'Đã tải ảnh đã xử lý lên Cloud server thành công.';
  } else if (msg.includes('WebSocket not connected. Saved composite photo locally only.')) {
    translatedMsg = 'WebSocket chưa kết nối. Chỉ lưu ảnh ghép ở thư mục cục bộ.';
  } else if (msg.includes('Composited photo saved:')) {
    translatedMsg = msg.replace('Composited photo saved:', 'Đã lưu ảnh ghép:');
  } else if (msg.includes('Error capturing / processing image:')) {
    translatedMsg = msg.replace('Error capturing / processing image:', 'Lỗi khi chụp / xử lý ảnh:');
  } else if (msg.includes('Starting simulated live view stream...')) {
    translatedMsg = 'Bắt đầu phát luồng xem trực tiếp giả lập...';
  } else if (msg.includes('Starting macOS live view movie stream...')) {
    translatedMsg = 'Bắt đầu phát luồng xem trực tiếp macOS movie...';
  } else if (msg.includes('Pausing live view for high-res capture...')) {
    translatedMsg = 'Đang tạm dừng xem trực tiếp để chụp ảnh chất lượng cao...';
  } else if (msg.includes('Triggering shutter, downloading to')) {
    translatedMsg = msg.replace('Triggering shutter, downloading to', 'Đang kích hoạt màn trập, tải về');
  } else if (msg.includes('Mock capture successful! Saved to')) {
    translatedMsg = msg.replace('Mock capture successful! Saved to', 'Chụp giả lập thành công! Đã lưu vào');
  } else if (msg.includes('Capture successful! Image saved to')) {
    translatedMsg = msg.replace('Capture successful! Image saved to', 'Chụp thành công! Ảnh đã lưu vào');
  } else if (msg.includes('Configuration saved.')) {
    translatedMsg = 'Đã lưu cấu hình.';
  }
  return translatedMsg;
}

// Bind UI actions
ui.bindEvents({
  onApply: (config) => {
    window.electronAPI.updateConfig(config);
    logger.addLog(i18n.getTranslation('logApplyingConfig'));
  },
  onCapture: () => {
    window.electronAPI.triggerCapture();
  },
  onClearLogs: () => {
    logger.clear();
    logger.addLog(i18n.getTranslation('logLogsCleared'));
  },
  onSourceChange: (source) => {
    ui.toggleWebcamSelectGroup(source);
    if (source === 'webcam') {
      webcam.startWebcam(ui.webcamDeviceSelect.value || '', ui.webcamVideo, ui.liveviewImg, ui.liveviewPlaceholder, ui.webcamDeviceSelect, i18n.currentLanguage, (msg, err) => logger.addLog(msg, err));
    } else {
      webcam.stopWebcam(ui.webcamVideo, null);
    }
    const currentConfigValues = ui.getCurrentConfigValues();
    window.electronAPI.updateConfig(currentConfigValues);
  },
  onWebcamDeviceChange: (deviceId) => {
    webcam.startWebcam(deviceId, ui.webcamVideo, ui.liveviewImg, ui.liveviewPlaceholder, ui.webcamDeviceSelect, i18n.currentLanguage, (msg, err) => logger.addLog(msg, err));
    const currentConfigValues = ui.getCurrentConfigValues();
    window.electronAPI.updateConfig(currentConfigValues);
  },
  onQualityChange: () => {
    const currentConfigValues = ui.getCurrentConfigValues();
    window.electronAPI.updateConfig(currentConfigValues);
  },
  onLanguageChange: (lang) => {
    i18n.translateUI(lang);
    webcam.loadDevices(ui.webcamDeviceSelect, lang);
    const currentConfigValues = ui.getCurrentConfigValues();
    window.electronAPI.updateConfig(currentConfigValues);
  },
  onStorageModeChange: (mode) => {
    const currentConfigValues = ui.getCurrentConfigValues();
    window.electronAPI.updateConfig(currentConfigValues);
    const modeName = mode === 'local' ? 'Chỉ Lưu Trên Máy (Local)' : (mode === 'gdrive' ? 'Chỉ Lưu Google Drive' : 'Lưu Cả Hai (Local & Drive)');
    const storageStatusText = document.getElementById('storage-status-text');
    if (storageStatusText) {
      storageStatusText.textContent = mode === 'local' ? 'Lưu Trên Máy (Local)' : (mode === 'gdrive' ? 'Lưu Google Drive (QR)' : 'Lưu Cả Hai (Local & Drive)');
    }
    logger.addLog(`Đã đổi chế độ lưu ảnh: ${modeName}`);
  }
});

// Setup IPC Listeners from Main Process
setupIpcListeners({
  onConfig: (config) => {
    console.log('[Renderer app.js] onConfig received:', config);
    currentConfig = config;
    ui.updateConfigFields(config);
    i18n.translateUI(config.language || 'vi');
    ui.toggleWebcamSelectGroup(config.cameraSource || 'webcam');
    frameEditor.loadConfig(config);

    if (config.cameraSource === 'webcam') {
      webcam.startWebcam(config.webcamDeviceId || '', ui.webcamVideo, ui.liveviewImg, ui.liveviewPlaceholder, ui.webcamDeviceSelect, i18n.currentLanguage, (msg, err) => logger.addLog(msg, err));
    } else {
      webcam.stopWebcam(ui.webcamVideo, null);
      ui.startLiveview();
    }
  },
  onWebcamStartStream: () => {
    logger.addLog(i18n.currentLanguage === 'vi' ? 'Bắt đầu phát webcam lên cloud...' : 'Starting webcam stream to cloud...');
    webcam.startWebcamStreamToCloud(ui.webcamVideo, ui.webcamCanvas, currentConfig.liveViewQuality);
  },
  onWebcamStopStream: () => {
    logger.addLog(i18n.currentLanguage === 'vi' ? 'Dừng phát webcam lên cloud.' : 'Stopping webcam stream to cloud.');
    webcam.stopWebcamStreamToCloud();
  },
  onWebcamCaptureTrigger: () => {
    logger.addLog(i18n.currentLanguage === 'vi' ? 'Đang trích xuất ảnh chất lượng cao từ webcam...' : 'Extracting high quality frame from webcam...');
    webcam.captureFrame(ui.webcamVideo, ui.webcamCanvas);
  },
  onLocalFrame: (frameBuffer) => {
    ui.renderLocalFrame(frameBuffer, isCameraConnected);
  },
  onCameraConnected: (camera) => {
    console.log('[Renderer app.js] onCameraConnected received:', camera);
    isCameraConnected = true;
    ui.updateCameraStatus(true, camera.model, translations, i18n.currentLanguage);

    const source = ui.cameraSourceSelect.value;
    if (source === 'dslr_canon' || source === 'dslr_sony') {
      ui.startLiveview();
    }
  },
  onCameraDisconnected: () => {
    console.log('[Renderer app.js] onCameraDisconnected received');
    if (!isCameraConnected) return;
    isCameraConnected = false;
    ui.updateCameraStatus(false, null, translations, i18n.currentLanguage);
    ui.stopLiveview();
  },
  onServerStatus: (status) => {
    console.log('[Renderer app.js] onServerStatus received:', status);
    ui.updateCloudStatus(status, translations, i18n.currentLanguage);
  },
  onLog: (msg) => {
    const isErr = msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error');
    const isSucc = msg.toLowerCase().includes('successful') || msg.toLowerCase().includes('uploaded') || msg.toLowerCase().includes('composited');
    const translated = translateLogMessage(msg, i18n.currentLanguage);
    logger.addLog(translated, isErr, isSucc);
  },
  onPhotoUploaded: (data) => {
    console.log('[Renderer app.js] onPhotoUploaded received:', data);
    
    const modal = document.getElementById('photo-modal');
    const modalImg = document.getElementById('modal-photo-img');
    const qrContainer = document.getElementById('modal-qrcode-container');
    const countdownEl = document.getElementById('modal-countdown');
    const closeBtn = document.getElementById('close-modal-btn');
    
    // Clear old QR code
    qrContainer.innerHTML = '';
    
    // Set image source
    if (data.localPath) {
      modalImg.src = 'file:///' + data.localPath.replace(/\\/g, '/');
    }
    
    // Generate QR Code if download link is available
    if (data.downloadLink) {
      new QRCode(qrContainer, {
        text: data.downloadLink,
        width: 180,
        height: 180,
        colorDark : '#0f172a',
        colorLight : '#ffffff',
        correctLevel : QRCode.CorrectLevel.H
      });
      document.querySelector('.qr-instruction').style.display = 'block';
    } else {
      qrContainer.innerHTML = '<div style="color: #10b981; font-weight: 700; text-align: center; font-size: 0.85rem; padding: 12px; line-height: 1.5;">📁 Đã Lưu An Toàn<br>Trên Máy Tính</div>';
      document.querySelector('.qr-instruction').style.display = 'none';
    }
    
    // Show Modal
    modal.style.display = 'flex';
    
    // Countdown Timer logic
    let secondsLeft = 15;
    countdownEl.textContent = i18n.currentLanguage === 'vi' 
      ? `Tự đóng sau ${secondsLeft}s` 
      : `Closing in ${secondsLeft}s`;
      
    if (window.photoModalInterval) {
      clearInterval(window.photoModalInterval);
    }
    
    const closeModal = () => {
      modal.style.display = 'none';
      clearInterval(window.photoModalInterval);
      window.photoModalInterval = null;
    };
    
    closeBtn.onclick = closeModal;
    
    window.photoModalInterval = setInterval(() => {
      secondsLeft--;
      countdownEl.textContent = i18n.currentLanguage === 'vi' 
        ? `Tự đóng sau ${secondsLeft}s` 
        : `Closing in ${secondsLeft}s`;
        
      if (secondsLeft <= 0) {
        closeModal();
      }
    }, 1000);
  },
  onOverlayUpdated: (data) => {
    if (data) {
      frameEditor.loadConfig({
        frameLayers: data.layers,
        frameAspectRatio: data.aspectRatio,
        frameEnabled: data.enabled,
        frameOverlayPath: data.overlayPath
      });
      const ratio = data.aspectRatio || '3:2';
      const count = data.layers ? data.layers.length : 0;
      logger.addLog(`Đã cập nhật khung ảnh: ${count} layers, tỷ lệ ${ratio}.`);
    }
  }
});

// Listen for Kiosk Window Status
window.electronAPI.onKioskStatus((status) => {
  const kioskStatusText = document.getElementById('kiosk-status-text');
  const kioskStatusDot = document.getElementById('kiosk-status-dot');

  if (ui.btnOpenKiosk) {
    if (status && status.open) {
      ui.btnOpenKiosk.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      ui.btnOpenKiosk.querySelector('span').textContent = 'Đóng Màn Hình Kiosk';
      if (kioskStatusText) kioskStatusText.textContent = 'Đang Mở (Live)';
      if (kioskStatusDot) {
        kioskStatusDot.style.background = '#10b981';
        kioskStatusDot.style.boxShadow = '0 0 10px #10b981';
      }
    } else {
      ui.btnOpenKiosk.style.background = 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)';
      ui.btnOpenKiosk.querySelector('span').textContent = 'Mở Màn Hình Kiosk';
      if (kioskStatusText) kioskStatusText.textContent = 'Chưa Mở (F11)';
      if (kioskStatusDot) {
        kioskStatusDot.style.background = '#64748b';
        kioskStatusDot.style.boxShadow = 'none';
      }
    }
  }
});

// Listen for Google Auth Status
window.electronAPI.onGoogleAuthStatus((status) => {
  ui.updateGoogleDriveStatus(status);
});

// Query initial Google Auth Status on launch
window.electronAPI.getGoogleAuthStatus().then((status) => {
  ui.updateGoogleDriveStatus(status);
}).catch((e) => console.log('Error checking Google Auth:', e));

// Initial startup log
logger.addLog(i18n.getTranslation('logDashboardLoaded'));

// Load webcam devices list on startup
webcam.loadDevices(ui.webcamDeviceSelect, i18n.currentLanguage);

// Notify main process that renderer is ready and listening for events
window.electronAPI.rendererReady();
