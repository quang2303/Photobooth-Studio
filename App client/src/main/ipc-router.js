const { ipcMain } = require('electron');

function registerIpc(handlers = {}) {
  // Clear any existing handlers to prevent duplicates
  ipcMain.removeAllListeners('renderer-ready');
  ipcMain.removeAllListeners('kiosk-ready');
  ipcMain.removeAllListeners('update-config');
  ipcMain.removeAllListeners('trigger-capture');
  ipcMain.removeAllListeners('kiosk-trigger-capture');
  ipcMain.removeAllListeners('open-admin-page');
  ipcMain.removeAllListeners('open-room-page');
  ipcMain.removeAllListeners('open-kiosk');
  ipcMain.removeAllListeners('close-kiosk');
  ipcMain.removeAllListeners('toggle-kiosk');
  ipcMain.removeAllListeners('set-kiosk-fullscreen');
  ipcMain.removeAllListeners('open-local-folder');
  ipcMain.removeAllListeners('notify-webcam-connected');
  ipcMain.removeAllListeners('notify-webcam-disconnected');
  ipcMain.removeAllListeners('webcam-frame');
  ipcMain.removeAllListeners('webcam-captured-image');
  ipcMain.removeHandler('start-camera-video');
  ipcMain.removeHandler('stop-camera-video');
  ipcMain.removeHandler('start-google-auth');
  ipcMain.removeHandler('disconnect-google-auth');
  ipcMain.removeHandler('get-google-auth-status');
  ipcMain.removeHandler('open-layer-dialog');
  ipcMain.removeHandler('import-layer-file');
  ipcMain.removeHandler('delete-layer-file');
  ipcMain.removeHandler('save-frame-configuration');
  ipcMain.removeHandler('get-frame-configuration');
  ipcMain.removeHandler('toggle-frame-enabled');

  if (handlers.onRendererReady) {
    ipcMain.on('renderer-ready', () => handlers.onRendererReady());
  }
  if (handlers.onKioskReady) {
    ipcMain.on('kiosk-ready', () => handlers.onKioskReady());
  }
  if (handlers.onUpdateConfig) {
    ipcMain.on('update-config', (event, newConfig) => handlers.onUpdateConfig(event, newConfig));
  }
  if (handlers.onTriggerCapture) {
    ipcMain.on('trigger-capture', () => handlers.onTriggerCapture());
  }
  if (handlers.onKioskTriggerCapture) {
    ipcMain.on('kiosk-trigger-capture', () => handlers.onKioskTriggerCapture());
  }
  if (handlers.onOpenAdminPage) {
    ipcMain.on('open-admin-page', () => handlers.onOpenAdminPage());
  }
  if (handlers.onOpenRoomPage) {
    ipcMain.on('open-room-page', () => handlers.onOpenRoomPage());
  }
  if (handlers.onOpenKiosk) {
    ipcMain.on('open-kiosk', () => handlers.onOpenKiosk());
  }
  if (handlers.onCloseKiosk) {
    ipcMain.on('close-kiosk', () => handlers.onCloseKiosk());
  }
  if (handlers.onToggleKiosk) {
    ipcMain.on('toggle-kiosk', () => handlers.onToggleKiosk());
  }
  if (handlers.onSetKioskFullscreen) {
    ipcMain.on('set-kiosk-fullscreen', (event, flag) => handlers.onSetKioskFullscreen(flag));
  }
  if (handlers.onOpenLocalFolder) {
    ipcMain.on('open-local-folder', () => handlers.onOpenLocalFolder());
  }
  if (handlers.onNotifyWebcamConnected) {
    ipcMain.on('notify-webcam-connected', () => handlers.onNotifyWebcamConnected());
  }
  if (handlers.onNotifyWebcamDisconnected) {
    ipcMain.on('notify-webcam-disconnected', () => handlers.onNotifyWebcamDisconnected());
  }
  if (handlers.onWebcamFrame) {
    ipcMain.on('webcam-frame', (event, arrayBuffer) => handlers.onWebcamFrame(event, arrayBuffer));
  }
  if (handlers.onWebcamCapturedImage) {
    ipcMain.on('webcam-captured-image', (event, dataUrl) => handlers.onWebcamCapturedImage(event, dataUrl));
  }
  if (handlers.onStartCameraVideo) {
    ipcMain.handle('start-camera-video', () => handlers.onStartCameraVideo());
  }
  if (handlers.onStopCameraVideo) {
    ipcMain.handle('stop-camera-video', () => handlers.onStopCameraVideo());
  }
  if (handlers.onStartGoogleAuth) {
    ipcMain.handle('start-google-auth', () => handlers.onStartGoogleAuth());
  }
  if (handlers.onDisconnectGoogleAuth) {
    ipcMain.handle('disconnect-google-auth', () => handlers.onDisconnectGoogleAuth());
  }
  if (handlers.onGetGoogleAuthStatus) {
    ipcMain.handle('get-google-auth-status', () => handlers.onGetGoogleAuthStatus());
  }
  if (handlers.onOpenLayerDialog) {
    ipcMain.handle('open-layer-dialog', () => handlers.onOpenLayerDialog());
  }
  if (handlers.onImportLayerFile) {
    ipcMain.handle('import-layer-file', (event, sourcePath) => handlers.onImportLayerFile(sourcePath));
  }
  if (handlers.onDeleteLayerFile) {
    ipcMain.handle('delete-layer-file', (event, fileNameOrPath) => handlers.onDeleteLayerFile(fileNameOrPath));
  }
  if (handlers.onSaveFrameConfig) {
    ipcMain.handle('save-frame-configuration', (event, data) => handlers.onSaveFrameConfig(data));
  }
  if (handlers.onGetFrameConfig) {
    ipcMain.handle('get-frame-configuration', () => handlers.onGetFrameConfig());
  }
  if (handlers.onToggleFrameEnabled) {
    ipcMain.handle('toggle-frame-enabled', (event, enabled) => handlers.onToggleFrameEnabled(enabled));
  }
  if (handlers.onGetBuiltinTemplates) {
    ipcMain.handle('get-builtin-templates', () => handlers.onGetBuiltinTemplates());
  }
  if (handlers.onApplyBuiltinTemplate) {
    ipcMain.handle('apply-builtin-template', (event, templateId) => handlers.onApplyBuiltinTemplate(templateId));
  }
}

module.exports = {
  registerIpc
};
