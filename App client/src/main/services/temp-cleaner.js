const fs = require('fs');
const path = require('path');
const os = require('os');

class TempCleaner {
  constructor() {
    this.periodicTimer = null;
    this.pendingDeletes = new Set();
  }

  /**
   * Delete a single file safely
   */
  safeDeleteFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return;
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[TempCleaner] Deleted temp file: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.warn(`[TempCleaner] Failed to delete temp file ${filePath}: ${err.message}`);
    }
  }

  /**
   * Schedule a file to be deleted after a delay (e.g. 30s after user preview modal is shown)
   */
  scheduleDelayedDelete(filePath, delayMs = 30000) {
    if (!filePath || typeof filePath !== 'string') return;
    if (this.pendingDeletes.has(filePath)) return;

    this.pendingDeletes.add(filePath);
    setTimeout(() => {
      this.pendingDeletes.delete(filePath);
      this.safeDeleteFile(filePath);
    }, delayMs);
  }

  /**
   * Clean all temporary files in a directory older than maxAgeMs
   * If maxAgeMs === 0, cleans all matching temp files immediately.
   */
  cleanDirectory(dirPath, maxAgeMs = 0) {
    if (!dirPath || !fs.existsSync(dirPath)) return;

    try {
      const now = Date.now();
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (file.startsWith('tmp_') || file === 'temp') {
              this.cleanDirectory(fullPath, maxAgeMs);
              try { fs.rmdirSync(fullPath); } catch (e) {}
            }
          } else if (stat.isFile()) {
            const ageMs = now - stat.mtimeMs;
            const ext = path.extname(file).toLowerCase();
            const isTempPattern = (
              file.startsWith('canon_capture_') ||
              file.startsWith('composite_') ||
              file.startsWith('room_overlay_') ||
              file.startsWith('win_preview') ||
              file.startsWith('temp_') ||
              ext === '.tmp'
            );

            if (isTempPattern && (maxAgeMs === 0 || ageMs >= maxAgeMs)) {
              this.safeDeleteFile(fullPath);
            }
          }
        } catch (fileErr) {
          // Ignore files that are in use or already removed
        }
      }
    } catch (err) {
      console.warn(`[TempCleaner] Error reading directory ${dirPath}: ${err.message}`);
    }
  }

  /**
   * Clean all known app temp directories:
   * 1. App client/tmp/
   * 2. os.tmpdir()/camera-sync-agent/ (Sony downloads)
   */
  cleanAllTempDirectories(appTempDir, maxAgeMs = 0) {
    if (appTempDir) {
      this.cleanDirectory(appTempDir, maxAgeMs);
    }

    const sonyTempDir = path.join(os.tmpdir(), 'camera-sync-agent');
    if (fs.existsSync(sonyTempDir)) {
      this.cleanDirectory(sonyTempDir, maxAgeMs);
    }
  }

  /**
   * Start periodic background sweep (default: every 15 minutes, cleans files older than 5 minutes)
   */
  startPeriodicCleanup(appTempDir, intervalMs = 15 * 60 * 1000, maxAgeMs = 5 * 60 * 1000) {
    if (this.periodicTimer) return;

    this.periodicTimer = setInterval(() => {
      this.cleanAllTempDirectories(appTempDir, maxAgeMs);
    }, intervalMs);
  }

  stopPeriodicCleanup() {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }
}

module.exports = new TempCleaner();
