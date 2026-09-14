const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    this.credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  init() {
    if (this.drive) return;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    // 1. Check if OAuth 2.0 variables are provided (for personal Gmail accounts)
    if (clientId && clientSecret && refreshToken) {
      console.log('[Google Drive] Authenticating using OAuth 2.0 (Personal User Auth)...');
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        `http://localhost:8585/oauth2callback`
      );
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      this.drive = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('[Google Drive] Initialized Google Drive API client via OAuth 2.0 successfully.');
      return;
    }

    // 2. Otherwise, fall back to Service Account (JWT) (for Workspace accounts)
    console.log('[Google Drive] Authenticating using Google Service Account (JWT)...');
    if (!this.credentialsPath) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not defined in environment variables.');
    }

    const absoluteCredPath = path.resolve(process.cwd(), this.credentialsPath);
    if (!fs.existsSync(absoluteCredPath)) {
      throw new Error(`Google service account credentials file not found at: ${absoluteCredPath}`);
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: absoluteCredPath,
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
    });

    this.drive = google.drive({ version: 'v3', auth });
    console.log('[Google Drive] Initialized Google Drive API client via Service Account successfully.');
  }

  async getOrCreatePhotoboothFolder() {
    if (this.folderId && this.folderId.trim() !== '' && this.folderId !== 'your-google-drive-folder-id-here') {
      return this.folderId.trim();
    }

    if (this.photoboothFolderId) {
      return this.photoboothFolderId;
    }

    try {
      const q = "name = 'Photobooth' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents";
      const res = await this.drive.files.list({
        q,
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (res.data.files && res.data.files.length > 0) {
        this.photoboothFolderId = res.data.files[0].id;
        return this.photoboothFolderId;
      }

      const newFolder = await this.drive.files.create({
        requestBody: {
          name: 'Photobooth',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root']
        },
        fields: 'id, name',
        supportsAllDrives: true
      });

      this.photoboothFolderId = newFolder.data.id;
      return this.photoboothFolderId;
    } catch (err) {
      console.error('[Google Drive] Failed to get/create Photobooth folder on server:', err.message);
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

    // Create a readable stream from the buffer
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata = {
      name: filename
    };

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
      console.log(`[Google Drive] Setting public reader permission for File ID: ${fileId}`);
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
