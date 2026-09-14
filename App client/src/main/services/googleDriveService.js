// Lazy-loaded dependencies for fast app startup (avoid loading 20+ MB googleapis at launch)
let createDriveClient = null;
let OAuth2Client = null;
let GoogleAuth = null;

function loadGoogleDriveDeps() {
  if (!createDriveClient) {
    const driveModule = require('googleapis/build/src/apis/drive');
    createDriveClient = driveModule.drive;
    const authModule = require('google-auth-library');
    OAuth2Client = authModule.OAuth2Client;
    GoogleAuth = authModule.GoogleAuth;
  }
}

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { shell } = require('electron');
const { Readable } = require('stream');
const config = require('./config');

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.oauth2Client = null;
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    this.credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    this.loginServer = null;
    this.photoboothFolderId = null;
  }

  getEffectiveRefreshToken() {
    const cfg = config.get();
    return cfg.googleDriveRefreshToken || process.env.GOOGLE_REFRESH_TOKEN || '';
  }

  init() {
    if (this.drive) return;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = this.getEffectiveRefreshToken();

    // Fast-path: If neither OAuth nor Service Account credentials exist, return immediately without loading heavy libraries
    if (!refreshToken && !this.credentialsPath) {
      return;
    }

    loadGoogleDriveDeps();

    // 1. Check if OAuth 2.0 variables are provided (for personal Gmail accounts)
    if (clientId && clientSecret && refreshToken) {
      console.log('[Google Drive] Authenticating using OAuth 2.0 (User Auth)...');
      this.oauth2Client = new OAuth2Client(
        clientId,
        clientSecret,
        'http://localhost:8585/oauth2callback'
      );
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      this.drive = createDriveClient({ version: 'v3', auth: this.oauth2Client });
      console.log('[Google Drive] Initialized Google Drive API client via OAuth 2.0 successfully.');
      return;
    }

    // 2. Otherwise, fall back to Service Account (JWT) (for Workspace accounts)
    if (this.credentialsPath) {
      const absoluteCredPath = path.resolve(process.cwd(), this.credentialsPath);
      if (fs.existsSync(absoluteCredPath)) {
        console.log('[Google Drive] Authenticating using Google Service Account (JWT)...');
        const auth = new GoogleAuth({
          keyFile: absoluteCredPath,
          scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
        });

        this.drive = createDriveClient({ version: 'v3', auth });
        console.log('[Google Drive] Initialized Google Drive API client via Service Account successfully.');
        return;
      }
    }

    console.log('[Google Drive] No active Google Drive authentication credentials found.');
  }

  /**
   * Check status of connected account and storage quota
   */
  async getAccountStatus() {
    try {
      this.init();
      if (!this.drive) {
        return { connected: false, email: '', quota: null };
      }

      const about = await this.drive.about.get({
        fields: 'user, storageQuota'
      });

      const user = about.data.user || {};
      const storageQuota = about.data.storageQuota || {};

      const usedBytes = parseInt(storageQuota.usage || '0', 10);
      const totalBytes = parseInt(storageQuota.limit || '0', 10);

      const formatGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

      return {
        connected: true,
        email: user.emailAddress || config.get().googleDriveUserEmail || 'Connected',
        displayName: user.displayName || '',
        photoLink: user.photoLink || '',
        quota: {
          usageGB: formatGB(usedBytes),
          limitGB: totalBytes > 0 ? formatGB(totalBytes) : 'Unlimited',
          percent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
        }
      };
    } catch (err) {
      console.error('[Google Drive] Failed to get account status:', err.message);
      return {
        connected: false,
        email: '',
        quota: null,
        error: err.message
      };
    }
  }

  /**
   * Start 1-Click OAuth login via external browser
   */
  startOAuthLogin() {
    return new Promise((resolve, reject) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const port = 8585;
      const redirectUri = `http://localhost:${port}/oauth2callback`;

      if (!clientId || !clientSecret) {
        return reject(new Error('GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET chưa được cấu hình.'));
      }

      if (this.loginServer) {
        try { this.loginServer.close(); } catch (e) {}
      }

      loadGoogleDriveDeps();
      const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ]
      });

      console.log('[Google Drive] Starting local OAuth callback receiver on port', port);
      
      this.loginServer = http.createServer(async (req, res) => {
        try {
          if (req.url.startsWith('/oauth2callback')) {
            const query = url.parse(req.url, true).query;
            const code = query.code;

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <div style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
                  <h2 style="color: #10b981;">✅ Đăng Nhập Google Drive Thành Công!</h2>
                  <p>Bạn có thể đóng tab này và quay lại ứng dụng PhotoBooth.</p>
                </div>
              `);

              const { tokens } = await oauth2Client.getToken(code);
              oauth2Client.setCredentials(tokens);

              // Get user info
              const drive = createDriveClient({ version: 'v3', auth: oauth2Client });
              const about = await drive.about.get({ fields: 'user, storageQuota' });
              const email = (about.data.user && about.data.user.emailAddress) || '';

              // Save to config
              config.save({
                googleDriveRefreshToken: tokens.refresh_token,
                googleDriveUserEmail: email
              });

              // Re-bind drive
              this.drive = drive;
              this.oauth2Client = oauth2Client;

              console.log(`[Google Drive] Successfully authorized account: ${email}`);

              setTimeout(() => {
                if (this.loginServer) {
                  this.loginServer.close();
                  this.loginServer = null;
                }
              }, 1000);

              resolve({ success: true, email, refreshToken: tokens.refresh_token });
            } else {
              res.writeHead(400);
              res.end('Missing authorization code');
              reject(new Error('Missing authorization code from Google.'));
            }
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (authErr) {
          console.error('[Google Drive] OAuth exchange error:', authErr);
          res.writeHead(500);
          res.end('Authentication failed: ' + authErr.message);
          reject(authErr);
        }
      });

      this.loginServer.listen(port, () => {
        console.log('[Google Drive] Opening browser for Google login:', authUrl);
        shell.openExternal(authUrl);
      });

      this.loginServer.on('error', (err) => {
        console.error('[Google Drive] OAuth server listen error:', err);
        reject(err);
      });
    });
  }

  /**
   * Disconnect / Logout Google Drive account
   */
  disconnectAccount() {
    config.save({
      googleDriveRefreshToken: '',
      googleDriveUserEmail: ''
    });
    this.drive = null;
    this.oauth2Client = null;
    this.photoboothFolderId = null;
    console.log('[Google Drive] Disconnected Google Drive account.');
    return { success: true };
  }

  /**
   * Find or create the 'Photobooth' folder on the user's Google Drive (My Drive)
   */
  async getOrCreatePhotoboothFolder() {
    const cfg = config.get();
    // Only use custom folder if explicitly configured by the user in settings
    const customFolderId = (cfg.googleDriveFolderId || '').trim();
    if (customFolderId && customFolderId !== 'your-google-drive-folder-id-here') {
      return customFolderId;
    }

    // Only fallback to env folder ID if OAuth client is not active (e.g. pure Service Account)
    if (!this.oauth2Client && this.folderId && this.folderId.trim() !== '' && this.folderId !== 'your-google-drive-folder-id-here') {
      return this.folderId.trim();
    }

    if (this.photoboothFolderId) {
      return this.photoboothFolderId;
    }

    try {
      // 1. Search for existing folder named 'Photobooth' directly in My Drive (root)
      const q = "name = 'Photobooth' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents";
      const res = await this.drive.files.list({
        q,
        fields: 'files(id, name, parents)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (res.data.files && res.data.files.length > 0) {
        this.photoboothFolderId = res.data.files[0].id;
        console.log(`[Google Drive] Using existing "Photobooth" folder in My Drive (ID: ${this.photoboothFolderId})`);
        return this.photoboothFolderId;
      }

      // 2. Fallback: Search for any 'Photobooth' folder owned by the user
      const q2 = "name = 'Photobooth' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners";
      const res2 = await this.drive.files.list({
        q: q2,
        fields: 'files(id, name, parents)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (res2.data.files && res2.data.files.length > 0) {
        this.photoboothFolderId = res2.data.files[0].id;
        console.log(`[Google Drive] Using existing user "Photobooth" folder (ID: ${this.photoboothFolderId})`);
        return this.photoboothFolderId;
      }

      // 3. Not found: create a new folder named 'Photobooth' directly in My Drive ('root')
      console.log('[Google Drive] "Photobooth" folder not found. Creating new folder in My Drive (root)...');
      const newFolder = await this.drive.files.create({
        requestBody: {
          name: 'Photobooth',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root']
        },
        fields: 'id, name, parents',
        supportsAllDrives: true
      });

      this.photoboothFolderId = newFolder.data.id;
      console.log(`[Google Drive] Created "Photobooth" folder successfully in My Drive (ID: ${this.photoboothFolderId})`);

      // Set public reader permission on the folder
      try {
        await this.drive.permissions.create({
          fileId: this.photoboothFolderId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          },
          supportsAllDrives: true
        });
      } catch (pErr) {
        console.warn('[Google Drive] Notice: Photobooth folder permission setup:', pErr.message);
      }

      return this.photoboothFolderId;
    } catch (err) {
      console.error('[Google Drive] Failed to get or create Photobooth folder, saving to root:', err.message);
      return null;
    }
  }

  /**
   * Upload an image buffer to Google Drive.
   * @param {Buffer} buffer 
   * @param {string} filename 
   * @returns {Promise<{googleDriveFileId: string, webViewLink: string, downloadLink: string}>}
   */
  async uploadPhoto(buffer, filename) {
    this.init();
    if (!this.drive) {
      throw new Error('Google Drive chưa được kết nối hoặc cấu hình.');
    }

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata = {
      name: filename
    };

    // Save photo inside 'Photobooth' folder (create if missing)
    const targetFolderId = await this.getOrCreatePhotoboothFolder();
    if (targetFolderId) {
      fileMetadata.parents = [targetFolderId];
    }

    const media = {
      mimeType: 'image/jpeg',
      body: stream
    };

    console.log(`[Google Drive] Starting file upload to Google Drive: ${filename}`);
    
    // 1. Create file on Drive
    const file = await this.drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true
    });

    const fileId = file.data.id;
    console.log(`[Google Drive] File uploaded successfully. File ID: ${fileId}`);

    // 2. Set permission: type: 'anyone', role: 'reader'
    try {
      await this.drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        },
        supportsAllDrives: true
      });
    } catch (permError) {
      console.error(`[Google Drive] Failed to set public permission for File ID: ${fileId}:`, permError.message);
    }

    // 3. Get webViewLink and construct direct download link
    const webViewLink = file.data.webViewLink || '';
    const downloadLink = `https://drive.google.com/uc?export=download&id=${fileId}`;

    return {
      googleDriveFileId: fileId,
      webViewLink,
      downloadLink
    };
  }
}

module.exports = new GoogleDriveService();
