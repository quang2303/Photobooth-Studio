const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.kioskWindow = null;
    this.tray = null;
  }

  getMainWindow() {
    return this.mainWindow;
  }

  getKioskWindow() {
    return this.kioskWindow;
  }

  createWindow(config, onDidFinishLoadCallback = () => {}) {
    Menu.setApplicationMenu(null);

    this.mainWindow = new BrowserWindow({
      width: 1050,
      height: 800,
      show: true,
      center: true,
      title: 'PhotoBooth Dashboard',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      resizable: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    this.mainWindow.setMenu(null);
    this.mainWindow.removeMenu();

    // Load UI HTML
    this.mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer.html'));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
    });

    // Sync state once window finished loading
    this.mainWindow.webContents.on('did-finish-load', () => {
      this.sendToRenderer('config', config);
      this.sendToRenderer('kiosk-status', { open: !!(this.kioskWindow && !this.kioskWindow.isDestroyed()) });
      onDidFinishLoadCallback();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      if (this.kioskWindow && !this.kioskWindow.isDestroyed()) {
        this.kioskWindow.close();
        this.kioskWindow = null;
      }
      app.quit();
    });

    return this.mainWindow;
  }

  createKioskWindow(onReady = () => {}) {
    if (this.kioskWindow && !this.kioskWindow.isDestroyed()) {
      this.kioskWindow.show();
      this.kioskWindow.focus();
      return this.kioskWindow;
    }

    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    // If multiple monitors, use the secondary monitor
    const targetDisplay = displays.length > 1 ? displays[1] : displays[0];

    const initialWidth = Math.min(1100, Math.floor(targetDisplay.bounds.width * 0.85));
    const initialHeight = Math.min(750, Math.floor(targetDisplay.bounds.height * 0.85));
    const initialX = targetDisplay.bounds.x + Math.floor((targetDisplay.bounds.width - initialWidth) / 2);
    const initialY = targetDisplay.bounds.y + Math.floor((targetDisplay.bounds.height - initialHeight) / 2);

    this.kioskWindow = new BrowserWindow({
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
      fullscreen: false,
      frame: true,
      title: 'PhotoBooth Live View',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      resizable: true,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    this.kioskWindow.loadFile(path.join(__dirname, '..', '..', 'kiosk.html'));
    this.kioskWindow.setMenu(null);
    this.kioskWindow.removeMenu();

    this.kioskWindow.on('enter-full-screen', () => {
      if (this.kioskWindow && !this.kioskWindow.isDestroyed() && this.kioskWindow.webContents) {
        this.kioskWindow.webContents.send('kiosk-fullscreen-change', true);
      }
    });

    this.kioskWindow.on('leave-full-screen', () => {
      if (this.kioskWindow && !this.kioskWindow.isDestroyed() && this.kioskWindow.webContents) {
        this.kioskWindow.webContents.send('kiosk-fullscreen-change', false);
      }
    });

    this.kioskWindow.on('closed', () => {
      this.kioskWindow = null;
      this.sendToRenderer('kiosk-status', { open: false });
    });

    this.kioskWindow.webContents.on('did-finish-load', () => {
      this.sendToRenderer('kiosk-status', { open: true });
      onReady();
    });

    return this.kioskWindow;
  }

  setKioskFullScreen(isFullScreen) {
    if (this.kioskWindow && !this.kioskWindow.isDestroyed()) {
      this.kioskWindow.setFullScreen(!!isFullScreen);
    }
  }

  toggleKioskWindow() {
    if (this.kioskWindow && !this.kioskWindow.isDestroyed()) {
      this.kioskWindow.close();
      this.kioskWindow = null;
      this.sendToRenderer('kiosk-status', { open: false });
      return false;
    } else {
      this.createKioskWindow();
      return true;
    }
  }

  closeKioskWindow() {
    if (this.kioskWindow && !this.kioskWindow.isDestroyed()) {
      this.kioskWindow.close();
      this.kioskWindow = null;
      this.sendToRenderer('kiosk-status', { open: false });
    }
  }

  showWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  sendToKiosk(channel, data) {
    if (this.kioskWindow && !this.kioskWindow.isDestroyed() && this.kioskWindow.webContents) {
      this.kioskWindow.webContents.send(channel, data);
    }
  }

  sendToAll(channel, data) {
    this.sendToRenderer(channel, data);
    this.sendToKiosk(channel, data);
  }

  createTray(iconPath, triggerCaptureCallback) {
    this.tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Mở Bảng Điều Khiển (Admin)', click: () => this.showWindow() },
      { label: 'Mở Màn Hình Kiosk (Chụp Ảnh)', click: () => this.createKioskWindow() },
      { type: 'separator' },
      { label: 'Kích Hoạt Chụp Ảnh', click: () => triggerCaptureCallback() },
      { type: 'separator' },
      { label: 'Thoát', click: () => {
        app.isQuitting = true;
        app.quit();
      }}
    ]);

    this.tray.setToolTip('Hệ Thống Đồng Bộ Camera');
    this.tray.setContextMenu(contextMenu);
    
    this.tray.on('double-click', () => {
      this.showWindow();
    });
  }

  async ensureAssets() {
    const iconPath = await this.ensureTrayIcon();
    const sampleOverlayPath = await this.ensureSampleOverlay();
    return { iconPath, sampleOverlayPath };
  }

  // Generate an inline camera SVG tray icon if missing
  async ensureTrayIcon() {
    const assetTray = path.join(__dirname, '..', '..', 'assets', 'tray_icon.png');
    if (fs.existsSync(assetTray)) return assetTray;
    const rootTray = path.join(__dirname, '..', '..', 'tray_icon.png');
    if (fs.existsSync(rootTray)) return rootTray;

    const baseDir = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
    const iconPath = path.join(baseDir, 'tray_icon.png');
    if (fs.existsSync(iconPath)) return iconPath;

    const svgIcon = `
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" fill="#0f172a"/>
        <rect x="7" y="11" width="18" height="14" rx="2" fill="#e11d48"/>
        <circle cx="16" cy="18" r="4" fill="#ffffff"/>
        <rect x="13" y="8" width="6" height="3" rx="1" fill="#e11d48"/>
      </svg>
    `;

    try {
      await sharp(Buffer.from(svgIcon)).png().toFile(iconPath);
    } catch (err) {
      console.error('Failed to create tray icon:', err);
    }
    return iconPath;
  }

  // Generate sample overlay frame if missing
  async ensureSampleOverlay() {
    const baseDir = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
    const samplePath = path.join(baseDir, 'sample_overlay.png');
    if (fs.existsSync(samplePath)) return samplePath;

    const svgOverlay = `
      <svg width="1800" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="1100" width="1720" height="60" fill="#0f172a" opacity="0.8" />
        <text x="900" y="1140" fill="#ffffff" font-size="30" font-family="sans-serif" font-weight="bold" dominant-baseline="middle" text-anchor="middle">
          PHOTO BOOTH EVENT 2026 • CAPTURED VIA CLIENT AGENT
        </text>
      </svg>
    `;

    try {
      await sharp(Buffer.from(svgOverlay)).png().toFile(samplePath);
    } catch (err) {
      console.error('Failed to create sample overlay:', err);
    }
    return samplePath;
  }
}

module.exports = new WindowManager();
