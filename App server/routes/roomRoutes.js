const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const roomController = require('../controllers/roomController');
const Photo = require('../models/Photo');
const googleDriveService = require('../services/googleDriveService');

const publicDir = path.join(__dirname, '..', 'public');
const uploadDir = path.join(publicDir, 'uploads');
const overlayDir = path.join(uploadDir, 'overlays');
const layerDir = path.join(uploadDir, 'layers');
const videoDir = path.join(uploadDir, 'videos');

fs.mkdirSync(overlayDir, { recursive: true });
fs.mkdirSync(layerDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

// Multer Config for legacy overlay file uploads
const overlayStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, overlayDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'overlay-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadOverlay = multer({ storage: overlayStorage });

// Multer Config for layer uploads
const layerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, layerDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'layer-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadLayer = multer({ storage: layerStorage });

// Multer Config for video uploads
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, 'temp-video-' + uniqueSuffix + ext);
  }
});
const uploadVideo = multer({ storage: videoStorage });

// Routes definition
router.get('/api/rooms', roomController.getAllRooms);
router.get('/api/rooms-data/:roomName', roomController.getRoomDetails);
router.get('/api/active-devices', roomController.getActiveDevices);

router.post('/api/rooms', uploadOverlay.single('overlay'), roomController.createOrUpdateRoom);
router.post('/api/upload-layer', uploadLayer.single('layer'), roomController.uploadLayer);
router.post('/api/upload-video', uploadVideo.single('video'), roomController.uploadVideo);
router.post('/api/rooms/:roomName/trigger', roomController.triggerCapture);

router.delete('/api/rooms/:roomName', roomController.deleteRoom);

// Clean URLs fallbacks for browser view pages
router.get('/room/:roomName', (req, res) => {
  res.sendFile(path.join(publicDir, 'room.html'));
});

router.get('/room/:roomName/download', (req, res) => {
  res.sendFile(path.join(publicDir, 'download.html'));
});

router.get('/room/:roomName/display', (req, res) => {
  res.sendFile(path.join(publicDir, 'display.html'));
});

// GET photo metadata (useful for display screens to fetch Google Drive links)
router.get('/api/photo/metadata/:photoId', async (req, res) => {
  try {
    const photo = await Photo.findOne({ photoId: req.params.photoId });
    if (!photo) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    }
    res.json({
      photoId: photo.photoId,
      originalFileName: photo.originalFileName,
      localPath: photo.localPath,
      googleDriveFileId: photo.googleDriveFileId,
      webViewLink: photo.webViewLink,
      downloadLink: photo.downloadLink
    });
  } catch (err) {
    console.error('Error fetching photo metadata:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Single photo landing page
router.get('/photo/:photoId', async (req, res) => {
  try {
    const photo = await Photo.findOne({ photoId: req.params.photoId });
    if (!photo) {
      return res.status(404).send('<h3>Không tìm thấy ảnh hoặc liên kết đã hết hạn.</h3>');
    }
    res.sendFile(path.join(publicDir, 'photo.html'));
  } catch (err) {
    console.error('Error rendering photo page:', err.message);
    res.status(500).send('Lỗi máy chủ');
  }
});

// Stream raw photo data for <img> preview (directly from Google Drive or local filesystem)
router.get('/photo/raw/:photoId', async (req, res) => {
  try {
    const photo = await Photo.findOne({ photoId: req.params.photoId });
    if (!photo) {
      return res.status(404).send('Photo not found');
    }
    
    if (photo.googleDriveFileId) {
      googleDriveService.init();
      const response = await googleDriveService.drive.files.get(
        { fileId: photo.googleDriveFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', 'image/jpeg');
      response.data.pipe(res);
    } else if (photo.localPath) {
      const fullPath = path.resolve(publicDir, photo.localPath.replace(/^\//, ''));
      if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
      } else {
        res.status(404).send('Local photo file not found');
      }
    } else {
      res.status(404).send('No file location available');
    }
  } catch (err) {
    console.error('Error serving raw photo:', err.message);
    res.status(500).send('Error serving photo');
  }
});

// Download attachment route
router.get('/photo/download/:photoId', async (req, res) => {
  try {
    const photo = await Photo.findOne({ photoId: req.params.photoId });
    if (!photo) {
      return res.status(404).send('Photo not found');
    }
    
    const fileName = photo.originalFileName || `photo_${photo.photoId}.jpg`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    if (photo.googleDriveFileId) {
      googleDriveService.init();
      const response = await googleDriveService.drive.files.get(
        { fileId: photo.googleDriveFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', 'image/jpeg');
      response.data.pipe(res);
    } else if (photo.localPath) {
      const fullPath = path.resolve(publicDir, photo.localPath.replace(/^\//, ''));
      if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
      } else {
        res.status(404).send('Local photo file not found');
      }
    } else {
      res.status(404).send('No file location available');
    }
  } catch (err) {
    console.error('Error downloading photo:', err.message);
    res.status(500).send('Error downloading photo');
  }
});

module.exports = router;
