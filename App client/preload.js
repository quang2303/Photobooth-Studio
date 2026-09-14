const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Listeners (Main -> Renderer & Kiosk)
  onCameraConnected: (callback) => ipcRenderer.on('camera-connected', (event, data) => callback(data)),
  onCameraDisconnected: (callback) => ipcRenderer.on('camera-disconnected', (event) => callback()),
  onServerStatus: (callback) => ipcRenderer.on('server-status', (event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data)),
  onConfig: (callback) => ipcRenderer.on('config', (event, data) => callback(data)),
  onWebcamStartStream: (callback) => ipcRenderer.on('webcam-start-stream', (event) => callback()),
  onWebcamStopStream: (callback) => ipcRenderer.on('webcam-stop-stream', (event) => callback()),
  onWebcamCaptureTrigger: (callback) => ipcRenderer.on('webcam-capture-trigger', (event) => callback()),
  onLocalFrame: (callback) => ipcRenderer.on('local-frame', (event, data) => callback(data)),
  onPhotoUploaded: (callback) => ipcRenderer.on('photo-uploaded', (event, data) => callback(data)),
  onKioskStatus: (callback) => ipcRenderer.on('kiosk-status', (event, data) => callback(data)),
  onKioskPhotoReady: (callback) => ipcRenderer.on('kiosk-photo-ready', (event, data) => callback(data)),
  onKioskCaptureError: (callback) => ipcRenderer.on('kiosk-capture-error', (event, msg) => callback(msg)),
  onKioskFullscreenChange: (callback) => ipcRenderer.on('kiosk-fullscreen-change', (event, isFullscreen) => callback(isFullscreen)),
  onGoogleAuthStatus: (callback) => ipcRenderer.on('google-auth-status', (event, data) => callback(data)),
  onOverlayUpdated: (callback) => ipcRenderer.on('overlay-updated', (event, data) => callback(data)),

  // Senders (Renderer & Kiosk -> Main)
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  kioskReady: () => ipcRenderer.send('kiosk-ready'),
  updateConfig: (config) => ipcRenderer.send('update-config', config),
  triggerCapture: () => ipcRenderer.send('trigger-capture'),
  kioskTriggerCapture: () => ipcRenderer.send('kiosk-trigger-capture'),
  sendWebcamFrame: (dataUrl) => ipcRenderer.send('webcam-frame', dataUrl),
  sendWebcamCapturedImage: (dataUrl) => ipcRenderer.send('webcam-captured-image', dataUrl),
  notifyWebcamConnected: () => ipcRenderer.send('notify-webcam-connected'),
  notifyWebcamDisconnected: () => ipcRenderer.send('notify-webcam-disconnected'),
  openAdminPage: () => ipcRenderer.send('open-admin-page'),
  openRoomPage: () => ipcRenderer.send('open-room-page'),
  openKioskWindow: () => ipcRenderer.send('open-kiosk'),
  closeKioskWindow: () => ipcRenderer.send('close-kiosk'),
  toggleKioskWindow: () => ipcRenderer.send('toggle-kiosk'),
  setKioskFullscreen: (flag) => ipcRenderer.send('set-kiosk-fullscreen', flag),
  openLocalFolder: () => ipcRenderer.send('open-local-folder'),

  // Invoke Actions (Async)
  startCameraVideo: () => ipcRenderer.invoke('start-camera-video'),
  stopCameraVideo: () => ipcRenderer.invoke('stop-camera-video'),
  startGoogleAuth: () => ipcRenderer.invoke('start-google-auth'),
  disconnectGoogleAuth: () => ipcRenderer.invoke('disconnect-google-auth'),
  getGoogleAuthStatus: () => ipcRenderer.invoke('get-google-auth-status'),
  openLayerDialog: () => ipcRenderer.invoke('open-layer-dialog'),
  importLayerFile: (sourcePath) => ipcRenderer.invoke('import-layer-file', sourcePath),
  deleteLayerFile: (fileNameOrPath) => ipcRenderer.invoke('delete-layer-file', fileNameOrPath),
  saveFrameConfig: (data) => ipcRenderer.invoke('save-frame-configuration', data),
  getFrameConfig: () => ipcRenderer.invoke('get-frame-configuration'),
  toggleFrameEnabled: (enabled) => ipcRenderer.invoke('toggle-frame-enabled', enabled),
  getBuiltinTemplates: () => ipcRenderer.invoke('get-builtin-templates'),
  applyBuiltinTemplate: (templateId) => ipcRenderer.invoke('apply-builtin-template', templateId)
});
