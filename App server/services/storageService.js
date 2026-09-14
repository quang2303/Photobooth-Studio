const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Photo = require('../models/Photo');
const googleDriveService = require('./googleDriveService');

class StorageService {
  constructor() {
    this.publicDir = path.join(__dirname, '..', 'public');
    this.localPhotosDir = path.join(this.publicDir, 'uploads', 'photos');
  }

  /**
   * Save a photo buffer to the configured storage driver with local fallback.
   * 
   * @param {Buffer} imageBuffer The photo binary data.
   * @param {string} originalFileName The original photo filename.
   * @param {string} roomName The room name for partitioning local files.
   * @returns {Promise<Document>} The saved Photo mongoose document.
   */
  async savePhoto(imageBuffer, originalFileName, roomName, googleDriveInfo = null) {
    const photoId = crypto.randomBytes(8).toString('hex'); // Secure random 16-character hex ID
    const normalizedRoom = (roomName || 'default-room').toLowerCase().trim();
    const storageDriver = process.env.STORAGE_DRIVER || 'local';

    console.log(`[Storage] Processing photo upload request: file=${originalFileName}, room=${normalizedRoom}, driver=${storageDriver}, photoId=${photoId}`);

    if (googleDriveInfo && googleDriveInfo.googleDriveFileId) {
      try {
        const photo = new Photo({
          photoId,
          originalFileName,
          localPath: '',
          googleDriveFileId: googleDriveInfo.googleDriveFileId,
          webViewLink: googleDriveInfo.webViewLink,
          downloadLink: googleDriveInfo.downloadLink
        });
        
        await photo.save();
        console.log(`[Storage] Successfully saved photo to Google Drive (using client-provided upload info): photoId=${photoId}, fileId=${googleDriveInfo.googleDriveFileId}`);
        return photo;
      } catch (err) {
        console.error(`[Storage] Client-provided Google Drive metadata save failed! Falling back. Error: ${err.message}`);
      }
    }

    if (storageDriver === 'google_drive') {
      try {
        const driveResult = await googleDriveService.uploadPhoto(imageBuffer, originalFileName);
        
        // Save to MongoDB with Google Drive metadata
        const photo = new Photo({
          photoId,
          originalFileName,
          localPath: '',
          googleDriveFileId: driveResult.googleDriveFileId,
          webViewLink: driveResult.webViewLink,
          downloadLink: driveResult.downloadLink
        });
        
        await photo.save();
        console.log(`[Storage] Successfully saved photo to Google Drive: photoId=${photoId}, fileId=${driveResult.googleDriveFileId}`);
        return photo;
      } catch (err) {
        console.error(`[Storage] Google Drive upload failed! Falling back to local storage. Error: ${err.message}`);
        // Let it fall through to local storage logic below
      }
    }

    // Local Storage (Fallback or Default)
    try {
      const roomDir = path.join(this.localPhotosDir, normalizedRoom);
      fs.mkdirSync(roomDir, { recursive: true });

      const uniqueFileName = `${photoId}_${originalFileName}`;
      const localFilePath = path.join(roomDir, uniqueFileName);
      fs.writeFileSync(localFilePath, imageBuffer);

      const relativePath = `/uploads/photos/${normalizedRoom}/${uniqueFileName}`;
      console.log(`[Storage] Successfully saved photo locally: ${relativePath}`);

      // Save to MongoDB with Local storage metadata
      const photo = new Photo({
        photoId,
        originalFileName,
        localPath: relativePath,
        googleDriveFileId: '',
        webViewLink: '',
        downloadLink: relativePath // Point download directly to the local file URL
      });

      await photo.save();
      return photo;
    } catch (localErr) {
      console.error(`[Storage] Local storage fallback failed!`, localErr.message);
      throw localErr;
    }
  }
}

module.exports = new StorageService();
