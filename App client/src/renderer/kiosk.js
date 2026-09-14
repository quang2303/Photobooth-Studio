// Kiosk Screen Controller (Browser Renderer Process)

const screenIdle = document.getElementById('screen-idle');
const screenCountdown = document.getElementById('screen-countdown');
const screenFlash = document.getElementById('screen-flash');
const screenProcessing = document.getElementById('screen-processing');
const screenResult = document.getElementById('screen-result');

const liveVideo = document.getElementById('liveview-video');
const liveCanvas = document.getElementById('liveview-canvas');
const liveOverlay = document.getElementById('live-overlay');
const liveviewContainerBox = document.getElementById('liveview-container-box');
const viewfinderGuide = document.getElementById('viewfinder-guide');
const countdownVal = document.getElementById('countdown-val');
const cameraAlert = document.getElementById('camera-alert');
const btnClose = document.getElementById('btn-close-kiosk');
const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
const btnShutter = document.getElementById('btn-shutter');
const resultPhotoImg = document.getElementById('result-photo-img');
const qrCanvas = document.getElementById('qr-canvas');
const resetProgress = document.getElementById('reset-progress');
const btnDone = document.getElementById('btn-done-photo');

let currentConfig = {};
let isShooting = false;
let autoResetInterval = null;
let currentWebcamStream = null;
let prevBlobUrl = null;

// Synthetic Web Audio API Sound Effects
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(frequency = 800, duration = 0.15) {
  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playShutterSound() {
  try {
    playBeep(1200, 0.25);
  } catch (e) {}
}

// 1. Initialize State & Listeners
function init() {
  // Tell main process kiosk is ready
  window.electronAPI.kioskReady();

  // Resize liveview container on window resize
  window.addEventListener('resize', resizeLiveviewContainer);

  // Listen for config
  window.electronAPI.onConfig((cfg) => {
    console.log('[Kiosk] Config received:', cfg);
    currentConfig = cfg;
    setupCameraSource();
    setupOverlay();
    resizeLiveviewContainer();
  });

  // Listen for live overlay update
  if (window.electronAPI.onOverlayUpdated) {
    window.electronAPI.onOverlayUpdated((data) => {
      console.log('[Kiosk] Overlay updated:', data);
      if (data) {
        currentConfig.frameOverlayPath = data.overlayPath;
        currentConfig.frameAspectRatio = data.aspectRatio;
        currentConfig.frameEnabled = data.enabled;
        setupOverlay();
        resizeLiveviewContainer();
      }
    });
  }

  // Listen for camera status
  window.electronAPI.onCameraConnected((cam) => {
    console.log('[Kiosk] Camera connected:', cam);
    if (cameraAlert) cameraAlert.style.display = 'none';
  });

  window.electronAPI.onCameraDisconnected(() => {
    console.log('[Kiosk] Camera disconnected');
    if (cameraAlert) cameraAlert.style.display = 'flex';
  });

  // Listen for DSLR frames
  window.electronAPI.onLocalFrame((frameBuffer) => {
    if (currentConfig.cameraSource !== 'webcam') {
      renderDSLRFrame(frameBuffer);
    }
  });

  // Listen for final photo result
  window.electronAPI.onKioskPhotoReady((data) => {
    displayResult(data);
  });

  // Listen for capture error
  if (window.electronAPI.onKioskCaptureError) {
    window.electronAPI.onKioskCaptureError((errorMsg) => {
      console.error('[Kiosk] Capture error:', errorMsg);
      if (screenProcessing && screenProcessing.style.display !== 'none') {
        alert('Lỗi chụp ảnh: ' + (errorMsg || 'Không thể chụp ảnh từ máy ảnh. Vui lòng kiểm tra lại máy ảnh và thử lại.'));
        returnToIdle();
      }
    });
  }

  // Listen for trigger command from main or webcam
  window.electronAPI.onWebcamCaptureTrigger(() => {
    if (currentConfig.cameraSource === 'webcam') {
      captureWebcamFrame();
    }
  });

  // Bind UI Events
  if (screenIdle) {
    screenIdle.addEventListener('click', () => {
      startCaptureSequence();
    });
  }

  if (btnShutter) {
    btnShutter.addEventListener('click', (e) => {
      e.stopPropagation();
      startCaptureSequence();
    });
  }

  if (btnDone) {
    btnDone.addEventListener('click', returnToIdle);
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      window.electronAPI.closeKioskWindow();
    });
  }

  // Fullscreen button click: Go fullscreen & hide button
  if (btnFullscreenToggle) {
    btnFullscreenToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.setKioskFullscreen(true);
      btnFullscreenToggle.style.display = 'none';
    });
  }

  // Listen for fullscreen state changes
  if (window.electronAPI.onKioskFullscreenChange) {
    window.electronAPI.onKioskFullscreenChange((isFullscreen) => {
      if (btnFullscreenToggle) {
        btnFullscreenToggle.style.display = isFullscreen ? 'none' : 'flex';
      }
    });
  }

  // Keyboard shortcut listener
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isShooting) {
      startCaptureSequence();
    } else if (e.code === 'Escape') {
      // If currently fullscreen, exit fullscreen first and restore button
      if (document.fullscreenElement || window.innerHeight === screen.height) {
        window.electronAPI.setKioskFullscreen(false);
        if (btnFullscreenToggle) {
          btnFullscreenToggle.style.display = 'flex';
        }
      } else {
        window.electronAPI.closeKioskWindow();
      }
    } else if (e.code === 'F11') {
      e.preventDefault();
      const isFull = (document.fullscreenElement || window.innerHeight === screen.height);
      window.electronAPI.setKioskFullscreen(!isFull);
      if (btnFullscreenToggle) {
        btnFullscreenToggle.style.display = !isFull ? 'none' : 'flex';
      }
    }
  });
}

// 2. Camera Setup (Webcam vs DSLR)
async function setupCameraSource() {
  if (currentConfig.cameraSource === 'webcam') {
    liveCanvas.style.display = 'none';
    liveVideo.style.display = 'block';

    if (!currentWebcamStream) {
      try {
        const constraints = {
          video: currentConfig.webcamDeviceId 
            ? { deviceId: { exact: currentConfig.webcamDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentWebcamStream = stream;
        liveVideo.srcObject = stream;
        if (cameraAlert) cameraAlert.style.display = 'none';
      } catch (err) {
        console.error('[Kiosk] Failed to get webcam stream:', err);
        if (cameraAlert) cameraAlert.style.display = 'flex';
      }
    }
  } else {
    // DSLR Mode
    if (currentWebcamStream) {
      currentWebcamStream.getTracks().forEach(track => track.stop());
      currentWebcamStream = null;
    }
    liveVideo.style.display = 'none';
    liveCanvas.style.display = 'block';
  }
}

// Setup live overlay template
function setupOverlay() {
  const isEnabled = currentConfig.frameEnabled !== false;
  if (isEnabled && currentConfig.frameOverlayPath) {
    liveOverlay.src = `file://${currentConfig.frameOverlayPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    liveOverlay.style.display = 'block';
  } else {
    liveOverlay.style.display = 'none';
  }
  resizeLiveviewContainer();
}

function resizeLiveviewContainer() {
  const stage = document.getElementById('kiosk-stage');
  if (!stage || !liveviewContainerBox) return;

  const ratioStr = currentConfig.frameAspectRatio || '3:2';
  const parts = ratioStr.split(':');
  const wRatio = parseFloat(parts[0]) || 3;
  const hRatio = parseFloat(parts[1]) || 2;
  const R = wRatio / hRatio;

  const stageRect = stage.getBoundingClientRect();
  const maxW = stageRect.width;
  const maxH = stageRect.height;

  if (maxW <= 0 || maxH <= 0) return;

  let width, height;
  if (maxW / maxH > R) {
    height = maxH;
    width = maxH * R;
  } else {
    width = maxW;
    height = maxW / R;
  }

  liveviewContainerBox.style.width = `${Math.round(width)}px`;
  liveviewContainerBox.style.height = `${Math.round(height)}px`;
}

// Render DSLR frame to canvas with object URL cleanup
const canvasCtx = liveCanvas.getContext('2d');
const imgLoader = new Image();
imgLoader.onload = () => {
  liveCanvas.width = imgLoader.width;
  liveCanvas.height = imgLoader.height;
  canvasCtx.drawImage(imgLoader, 0, 0);
};

function renderDSLRFrame(buffer) {
  if (prevBlobUrl) {
    URL.revokeObjectURL(prevBlobUrl);
  }
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  prevBlobUrl = URL.createObjectURL(blob);
  imgLoader.src = prevBlobUrl;
}

// Capture frame directly from webcam if in webcam mode
function captureWebcamFrame() {
  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = liveVideo.videoWidth || 1920;
  captureCanvas.height = liveVideo.videoHeight || 1080;
  const ctx = captureCanvas.getContext('2d');
  
  // Flip horizontally back because mirror preview
  ctx.translate(captureCanvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(liveVideo, 0, 0, captureCanvas.width, captureCanvas.height);
  
  const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);
  window.electronAPI.sendWebcamCapturedImage(dataUrl);
}

// 3. Capture Sequence: Idle -> Countdown -> Flash -> Processing
function startCaptureSequence() {
  if (isShooting) return;
  isShooting = true;

  // Hide Idle, Show Countdown (liveview feed remains visible behind countdown!)
  if (screenIdle) screenIdle.style.display = 'none';
  if (screenResult) screenResult.style.display = 'none';
  if (viewfinderGuide) viewfinderGuide.style.opacity = '0.2';
  if (screenCountdown) screenCountdown.style.display = 'flex';

  let count = currentConfig.kioskCountdown || 3;
  if (countdownVal) {
    countdownVal.textContent = count;
    countdownVal.style.animation = 'none';
    void countdownVal.offsetWidth;
    countdownVal.style.animation = '';
  }
  playBeep(880, 0.15);

  const countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      if (countdownVal) {
        countdownVal.textContent = count;
        countdownVal.style.animation = 'none';
        void countdownVal.offsetWidth;
        countdownVal.style.animation = '';
      }
      playBeep(880, 0.15);
    } else {
      clearInterval(countdownInterval);
      triggerFlashAndCapture();
    }
  }, 1000);
}

function triggerFlashAndCapture() {
  // Shutter click & Flash
  playShutterSound();
  if (screenFlash) screenFlash.classList.add('flash-active');
  if (screenCountdown) screenCountdown.style.display = 'none';

  setTimeout(() => {
    if (screenFlash) screenFlash.classList.remove('flash-active');
    if (screenProcessing) screenProcessing.style.display = 'flex';

    // Tell main process to capture & process
    window.electronAPI.kioskTriggerCapture();
  }, 150);
}

// 4. Display Photo & QR Code
function displayResult(data) {
  if (screenProcessing) screenProcessing.style.display = 'none';
  if (screenResult) screenResult.style.display = 'flex';

  // Set composited photo
  if (data.localPath && resultPhotoImg) {
    resultPhotoImg.src = `file://${data.localPath.replace(/\\/g, '/')}?t=${Date.now()}`;
  }

  // Draw QR Code or show local saved message
  const qrBadge = document.querySelector('.qr-badge');
  const qrFrame = document.querySelector('.qr-frame');
  const qrDesc = document.querySelector('.qr-desc');
  const qrTitle = document.querySelector('.qr-title');

  if (data.qrCodeDataUrl) {
    if (qrBadge) qrBadge.textContent = '✨ Ảnh Đã Sẵn Sàng';
    if (qrFrame) qrFrame.style.display = 'flex';
    if (qrTitle) qrTitle.textContent = 'Quét Mã Tải Ảnh';
    if (qrDesc) qrDesc.textContent = 'Mở camera điện thoại để quét mã QR và tải ảnh gốc về máy';
    const qrImg = new Image();
    qrImg.onload = () => {
      qrCanvas.width = qrImg.width;
      qrCanvas.height = qrImg.height;
      const ctx = qrCanvas.getContext('2d');
      ctx.drawImage(qrImg, 0, 0);
    };
    qrImg.src = data.qrCodeDataUrl;
  } else {
    if (qrBadge) qrBadge.textContent = '💾 Đã Lưu Thành Công';
    if (qrFrame) qrFrame.style.display = 'none';
    if (qrTitle) qrTitle.textContent = 'Chụp Thành Công';
    if (qrDesc) qrDesc.textContent = 'Ảnh thành phẩm đã được lưu an toàn vào album trên máy tính.';
  }

  // Start 15s auto reset progress bar
  let duration = currentConfig.kioskAutoResetDelay || 15;
  let remaining = duration;
  if (resetProgress) resetProgress.style.width = '100%';

  if (autoResetInterval) clearInterval(autoResetInterval);

  autoResetInterval = setInterval(() => {
    remaining--;
    const percent = Math.max(0, (remaining / duration) * 100);
    if (resetProgress) resetProgress.style.width = `${percent}%`;

    if (remaining <= 0) {
      clearInterval(autoResetInterval);
      returnToIdle();
    }
  }, 1000);
}

// 5. Return to Idle State
function returnToIdle() {
  if (autoResetInterval) {
    clearInterval(autoResetInterval);
    autoResetInterval = null;
  }

  if (screenResult) screenResult.style.display = 'none';
  if (screenProcessing) screenProcessing.style.display = 'none';
  if (screenCountdown) screenCountdown.style.display = 'none';
  if (viewfinderGuide) viewfinderGuide.style.opacity = '1';
  if (screenIdle) screenIdle.style.display = 'flex';
  isShooting = false;
}

// Run on load
document.addEventListener('DOMContentLoaded', init);
