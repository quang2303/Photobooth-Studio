export function setupIpcListeners(callbacks = {}) {
  // Listen for config
  window.electronAPI.onConfig((config) => {
    if (callbacks.onConfig) callbacks.onConfig(config);
  });

  // Listen for webcam start streaming
  window.electronAPI.onWebcamStartStream(() => {
    if (callbacks.onWebcamStartStream) callbacks.onWebcamStartStream();
  });

  // Listen for webcam stop streaming
  window.electronAPI.onWebcamStopStream(() => {
    if (callbacks.onWebcamStopStream) callbacks.onWebcamStopStream();
  });

  // Listen for high res capture trigger
  window.electronAPI.onWebcamCaptureTrigger(() => {
    if (callbacks.onWebcamCaptureTrigger) callbacks.onWebcamCaptureTrigger();
  });

  // Listen for DSLR local live view frames
  window.electronAPI.onLocalFrame((frameBuffer) => {
    if (callbacks.onLocalFrame) callbacks.onLocalFrame(frameBuffer);
  });

  // Listen for camera connected status
  window.electronAPI.onCameraConnected((camera) => {
    if (callbacks.onCameraConnected) callbacks.onCameraConnected(camera);
  });

  // Listen for camera disconnected status
  window.electronAPI.onCameraDisconnected(() => {
    if (callbacks.onCameraDisconnected) callbacks.onCameraDisconnected();
  });

  // Listen for Cloud WebSocket status updates
  window.electronAPI.onServerStatus((status) => {
    if (callbacks.onServerStatus) callbacks.onServerStatus(status);
  });

  // Listen for logs
  window.electronAPI.onLog((msg) => {
    if (callbacks.onLog) callbacks.onLog(msg);
  });

  // Listen for completed photo upload
  window.electronAPI.onPhotoUploaded((data) => {
    if (callbacks.onPhotoUploaded) callbacks.onPhotoUploaded(data);
  });

  // Listen for overlay / frame updates
  if (window.electronAPI.onOverlayUpdated) {
    window.electronAPI.onOverlayUpdated((data) => {
      if (callbacks.onOverlayUpdated) callbacks.onOverlayUpdated(data);
    });
  }
}
