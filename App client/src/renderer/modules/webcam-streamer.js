export class WebcamStreamer {
  constructor() {
    this.webcamStream = null;
    this.webcamCaptureInterval = null;
    this.isSendingWebcamFrame = false;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
  }

  async loadDevices(webcamDeviceSelect, currentLanguage) {
    if (!webcamDeviceSelect) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      webcamDeviceSelect.innerHTML = '';
      
      if (videoDevices.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = currentLanguage === 'vi' ? 'Không tìm thấy camera nào' : 'No camera devices found';
        webcamDeviceSelect.appendChild(option);
        return;
      }
      
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `${currentLanguage === 'vi' ? 'Thiết bị camera' : 'Camera'} ${index + 1} (${device.deviceId.slice(0, 5)}...)`;
        webcamDeviceSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Error loading webcam devices:', err);
    }
  }

  async startWebcam(deviceId, webcamVideo, liveviewImg, liveviewPlaceholder, webcamDeviceSelect, currentLanguage, addLogCallback = () => {}) {
    try {
      this.stopWebcamStreamToCloud();
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach(track => track.stop());
        this.webcamStream = null;
      }
      if (webcamVideo) {
        webcamVideo.srcObject = null;
      }
      
      const constraints = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      
      if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
      }
      
      this.webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (webcamVideo) {
        webcamVideo.srcObject = this.webcamStream;
        webcamVideo.style.display = 'block';
      }
      if (liveviewImg) {
        liveviewImg.style.display = 'none';
      }
      if (liveviewPlaceholder) {
        liveviewPlaceholder.style.display = 'none';
      }
      
      // Refresh devices list so that labels are loaded now that permission has been granted
      const activeDeviceId = deviceId || this.webcamStream.getVideoTracks()[0]?.getSettings()?.deviceId;
      await this.loadDevices(webcamDeviceSelect, currentLanguage);
      if (webcamDeviceSelect && activeDeviceId) {
        webcamDeviceSelect.value = activeDeviceId;
      }
      
      window.electronAPI.notifyWebcamConnected();
    } catch (err) {
      let errorMsg = err.message;
      if (err.name === 'NotReadableError' || err.message.includes('Could not start video source')) {
        if (currentLanguage === 'vi') {
          errorMsg = 'Webcam hiện đang bị CHIẾM QUYỀN SỬ DỤNG ĐỘC QUYỀN bởi một ứng dụng khác (như Zoom, Teams, Chrome, hoặc ứng dụng Camera mặc định của Windows). Vui lòng đóng ứng dụng đó rồi nhấn "Lưu & Áp Dụng Cấu Hình" để thử lại.';
        } else {
          errorMsg = 'Webcam is currently occupied in EXCLUSIVE USE by another application (like Zoom, Teams, Chrome, or Windows Camera). Please close that application and click "Save & Apply Config" to try again.';
        }
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        if (currentLanguage === 'vi') {
          errorMsg = 'Quyền truy cập Webcam bị từ chối. Vui lòng cấp quyền camera trong cài đặt hệ thống.';
        } else {
          errorMsg = 'Webcam access permission denied. Please allow camera access in system settings.';
        }
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        if (currentLanguage === 'vi') {
          errorMsg = 'Không tìm thấy thiết bị camera.';
        } else {
          errorMsg = 'Camera device not found.';
        }
      } else if (err.name === 'OverconstrainedError') {
        if (deviceId) {
          addLogCallback(currentLanguage === 'vi' ? 'Thiết bị camera đã chọn không khả dụng, đang thử camera mặc định...' : 'Selected camera device is not available, trying default...', true);
          await this.startWebcam(null, webcamVideo, liveviewImg, liveviewPlaceholder, webcamDeviceSelect, currentLanguage, addLogCallback);
          return;
        }
      }
      
      addLogCallback(currentLanguage === 'vi' ? 'Không thể kết nối webcam: ' + errorMsg : 'Unable to connect webcam: ' + errorMsg, true);
      window.electronAPI.notifyWebcamDisconnected();
      
      if (webcamVideo) webcamVideo.style.display = 'none';
      if (liveviewPlaceholder) liveviewPlaceholder.style.display = 'flex';
      
      this.loadDevices(webcamDeviceSelect, currentLanguage);
    }
  }

  stopWebcam(webcamVideo, liveviewPlaceholder) {
    this.stopWebcamStreamToCloud();
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }
    if (webcamVideo) {
      webcamVideo.srcObject = null;
      webcamVideo.style.display = 'none';
    }
    if (liveviewPlaceholder) {
      liveviewPlaceholder.style.display = 'flex';
    }
    window.electronAPI.notifyWebcamDisconnected();
  }

  startWebcamStreamToCloud(webcamVideo, webcamCanvas, liveViewQuality) {
    if (this.webcamCaptureInterval) clearInterval(this.webcamCaptureInterval);
    
    this.isSendingWebcamFrame = false;
    
    this.webcamCaptureInterval = setInterval(() => {
      if (!this.webcamStream || !webcamVideo || webcamVideo.paused || webcamVideo.ended) return;
      if (this.isSendingWebcamFrame) return; // Prevent frame overlap
      
      // Determine target width and compression quality based on config setting
      let targetW = 960;
      let qualityVal = 0.7;
      const viewQuality = liveViewQuality || 'medium';
      if (viewQuality === 'low') {
        targetW = 640;
        qualityVal = 0.5;
      } else if (viewQuality === 'medium') {
        targetW = 960;
        qualityVal = 0.7;
      } else if (viewQuality === 'high') {
        targetW = 1280;
        qualityVal = 0.85;
      }

      const videoW = webcamVideo.videoWidth || 640;
      const videoH = webcamVideo.videoHeight || 480;
      
      const targetH = Math.round(targetW * (videoH / videoW)) || 480;
      
      // Try using OffscreenCanvas first to offload JPEG compression to background threads
      if (!this.offscreenCanvas) {
        try {
          this.offscreenCanvas = new OffscreenCanvas(targetW, targetH);
          this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        } catch (err) {
          console.error('OffscreenCanvas not supported, falling back to regular canvas:', err);
        }
      }
      
      if (this.offscreenCanvas) {
        if (this.offscreenCanvas.width !== targetW || this.offscreenCanvas.height !== targetH) {
          this.offscreenCanvas.width = targetW;
          this.offscreenCanvas.height = targetH;
        }
        this.offscreenCtx.drawImage(webcamVideo, 0, 0, targetW, targetH);
        
        this.isSendingWebcamFrame = true;
        
        this.offscreenCanvas.convertToBlob({ type: 'image/jpeg', quality: qualityVal })
          .then((blob) => {
            if (!blob || !this.webcamStream) {
              this.isSendingWebcamFrame = false;
              return null;
            }
            return blob.arrayBuffer();
          })
          .then((arrayBuffer) => {
            if (arrayBuffer) {
              window.electronAPI.sendWebcamFrame(arrayBuffer);
            }
            this.isSendingWebcamFrame = false;
          })
          .catch((err) => {
            console.error('Error encoding OffscreenCanvas frame:', err);
            this.isSendingWebcamFrame = false;
          });
      } else if (webcamCanvas) {
        // Fallback in case OffscreenCanvas is unavailable
        const ctx = webcamCanvas.getContext('2d');
        if (webcamCanvas.width !== targetW || webcamCanvas.height !== targetH) {
          webcamCanvas.width = targetW;
          webcamCanvas.height = targetH;
        }
        
        ctx.drawImage(webcamVideo, 0, 0, targetW, targetH);
        
        this.isSendingWebcamFrame = true;
        
        webcamCanvas.toBlob((blob) => {
          if (!blob || !this.webcamStream) {
            this.isSendingWebcamFrame = false;
            return;
          }
          blob.arrayBuffer().then((arrayBuffer) => {
            window.electronAPI.sendWebcamFrame(arrayBuffer);
            this.isSendingWebcamFrame = false;
          }).catch(() => {
            this.isSendingWebcamFrame = false;
          });
        }, 'image/jpeg', qualityVal);
      }
    }, 120); // ~8 fps - optimized for CPU stability and network bandwidth
  }

  stopWebcamStreamToCloud() {
    if (this.webcamCaptureInterval) {
      clearInterval(this.webcamCaptureInterval);
      this.webcamCaptureInterval = null;
    }
  }

  captureFrame(webcamVideo, webcamCanvas) {
    if (!webcamVideo || !webcamCanvas) return;

    const ctx = webcamCanvas.getContext('2d');
    const w = webcamVideo.videoWidth || 1280;
    const h = webcamVideo.videoHeight || 720;
    
    webcamCanvas.width = w;
    webcamCanvas.height = h;
    ctx.drawImage(webcamVideo, 0, 0, w, h);
    
    const dataUrl = webcamCanvas.toDataURL('image/jpeg', 0.9);
    window.electronAPI.sendWebcamCapturedImage(dataUrl);
  }
}
