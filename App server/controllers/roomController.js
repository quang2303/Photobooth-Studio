const path = require('path');
const fs = require('fs');
const Room = require('../models/Room');
const { getAspectRatioDimensions, mergeImageLayers } = require('../services/imageService');
const socketController = require('./socketController');

const publicDir = path.join(__dirname, '..', 'public');
const uploadDir = path.join(publicDir, 'uploads');
const overlayDir = path.join(uploadDir, 'overlays');
const photoDir = path.join(uploadDir, 'photos');

// Helper to delete unused layer file locally
const deleteLocalLayerFile = async (url, currentRoomId) => {
  if (!url || !url.startsWith('/uploads/')) {
    return;
  }
  
  if (url.includes('..')) {
    console.warn(`Potential directory traversal detected: ${url}`);
    return;
  }
  
  // Check if another room uses this file URL
  const isUsedElsewhere = await Room.findOne({
    _id: { $ne: currentRoomId },
    'layers.url': url
  });
  
  if (!isUsedElsewhere) {
    const filePath = path.join(publicDir, url);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Deleted unused layer file: ${filePath}`);
      } catch (err) {
        console.error(`Failed to delete layer file ${filePath}:`, err);
      }
    }
  } else {
    console.log(`Layer file is used elsewhere, skipping deletion: ${url}`);
  }
};


// Helper to get active devices list
const getActiveDevicesList = () => {
  const details = socketController.getAgentDetails();
  return Object.values(details).map(detail => ({
    deviceId: detail.deviceId,
    licenseKey: detail.licenseKey,
    roomName: detail.roomName,
    ip: detail.ip || 'Unknown'
  }));
};

exports.getActiveDevices = (req, res) => {
  res.json(getActiveDevicesList());
};

exports.getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({});
    const roomAgents = socketController.getRoomAgents();
    const activeViewers = socketController.getActiveViewers();
    
    const roomsList = rooms.map(room => {
      const isOnline = !!roomAgents[room.name];
      return {
        name: room.name,
        overlayUrl: room.overlayUrl,
        layers: room.layers,
        aspectRatio: room.aspectRatio,
        autoCaptureInterval: room.autoCaptureInterval,
        deviceId: room.deviceId,
        photos: room.photos,
        online: isOnline,
        activeViewers: activeViewers[room.name] || 0
      };
    });
    res.json(roomsList);
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ error: 'Lỗi tải danh sách phòng.' });
  }
};

exports.getRoomDetails = async (req, res) => {
  try {
    const roomName = (req.params.roomName || '').toLowerCase().trim();
    const room = await Room.findOne({ name: roomName });
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    }
    
    const roomAgents = socketController.getRoomAgents();
    const activeViewers = socketController.getActiveViewers();
    
    res.json({
      name: room.name,
      overlayUrl: room.overlayUrl,
      layers: room.layers,
      aspectRatio: room.aspectRatio,
      autoCaptureInterval: room.autoCaptureInterval,
      deviceId: room.deviceId,
      photos: room.photos,
      online: !!roomAgents[room.name],
      activeViewers: activeViewers[room.name] || 0,
      publicBaseUrl: process.env.PUBLIC_BASE_URL || ''
    });
  } catch (err) {
    console.error('Error fetching room details:', err);
    res.status(500).json({ error: 'Lỗi tải chi tiết phòng.' });
  }
};

exports.createOrUpdateRoom = async (req, res) => {
  try {
    const { roomName: roomNameRaw, aspectRatio, autoCaptureInterval } = req.body;
    if (!roomNameRaw) {
      return res.status(400).json({ error: 'Tên phòng là bắt buộc.' });
    }
    const roomName = roomNameRaw.toLowerCase().trim();
    
    let room = await Room.findOne({ name: roomName });
    const existingPhotos = room ? room.photos : [];
    
    let layers = [];
    if (req.body.layers) {
      try {
        layers = typeof req.body.layers === 'string' ? JSON.parse(req.body.layers) : req.body.layers;
      } catch (e) {
        console.error('Failed to parse layers JSON:', e);
      }
    } else if (room && room.layers) {
      layers = room.layers;
    }
    
    const finalAspectRatio = aspectRatio || (room ? room.aspectRatio : '3:2');
    const dimensions = getAspectRatioDimensions(finalAspectRatio);
    
    if (req.file) {
      const fileUrl = `/uploads/overlays/${req.file.filename}`;
      layers = [{
        id: 'legacy-overlay-' + Date.now(),
        type: 'image',
        url: fileUrl,
        name: req.file.originalname || 'Legacy Overlay'
      }];
    }

    // Identify deleted layers and clean up files if they are not used elsewhere
    if (room && room.layers) {
      const oldLayerUrls = room.layers
        .map(l => l.url)
        .filter(url => url && url.startsWith('/uploads/'));
      
      const newLayerUrls = new Set(
        layers.map(l => l.url).filter(url => url && url.startsWith('/uploads/'))
      );
      
      const deletedLayerUrls = oldLayerUrls.filter(url => !newLayerUrls.has(url));
      
      for (const url of deletedLayerUrls) {
        await deleteLocalLayerFile(url, room._id);
      }
    }
    
    let overlayUrl = '';
    const imageLayers = layers.filter(l => l.type === 'image');
    
    if (imageLayers.length > 0) {
      try {
        overlayUrl = await mergeImageLayers(imageLayers, roomName, publicDir, overlayDir, dimensions);
      } catch (err) {
        console.error('Error merging overlay images:', err);
        overlayUrl = imageLayers[0] ? imageLayers[0].url : '';
      }
    }
    
    if (room && room.overlayUrl && room.overlayUrl !== overlayUrl && room.overlayUrl.includes('/merged-')) {
      const oldPath = path.join(publicDir, room.overlayUrl);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.error('Failed to delete old merged overlay file:', err);
        }
      }
    }
    
    const roomData = {
      name: roomName,
      overlayUrl: overlayUrl,
      layers: layers,
      aspectRatio: finalAspectRatio,
      autoCaptureInterval: parseInt(autoCaptureInterval, 10) || 10,
      deviceId: req.body.deviceId || '',
      photos: existingPhotos
    };
    
    if (roomData.deviceId) {
      // Unbind this device from all other rooms to ensure uniqueness
      await Room.updateMany(
        { name: { $ne: roomName }, deviceId: roomData.deviceId },
        { $set: { deviceId: '' } }
      );
    }

    if (room) {
      room = await Room.findOneAndUpdate({ name: roomName }, roomData, { new: true });
    } else {
      room = new Room(roomData);
      await room.save();
    }
    
    socketController.syncAgentRooms();
    
    console.log(`Room created/updated in MongoDB: ${roomName}`);
    res.json({ success: true, room });
  } catch (err) {
    console.error('Error in createOrUpdateRoom:', err);
    res.status(500).json({ error: 'Lỗi thiết lập phòng chụp.' });
  }
};

exports.uploadLayer = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không thể upload file layer.' });
  }
  const fileUrl = `/uploads/layers/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
  res.json({
    success: true,
    url: fileUrl,
    type: fileType,
    name: req.file.originalname
  });
};

exports.uploadVideo = async (req, res) => {
  try {
    const roomNameRaw = req.body.roomName;
    if (!req.file || !roomNameRaw) {
      return res.status(400).json({ error: 'Thiếu file video hoặc tên phòng.' });
    }
    const roomName = roomNameRaw.toLowerCase().trim();
    
    const tempPath = req.file.path;
    const ext = path.extname(req.file.originalname) || '.webm';
    const filename = `video_${Date.now()}${ext}`;
    
    const roomPhotoDir = path.join(photoDir, roomName);
    fs.mkdirSync(roomPhotoDir, { recursive: true });
    
    const outputPath = path.join(roomPhotoDir, filename);
    const photoUrl = `/uploads/photos/${roomName}/${filename}`;
    
    console.log(`Saving video directly: ${tempPath} -> ${outputPath}`);
    
    try {
      fs.renameSync(tempPath, outputPath);
    } catch (renameErr) {
      // Fallback in case of cross-partition rename error (e.g. Temp directory on a different drive)
      fs.copyFileSync(tempPath, outputPath);
      fs.unlinkSync(tempPath);
    }
    
    console.log(`Video saved successfully: ${photoUrl}`);
    
    const room = await Room.findOne({ name: roomName });
    if (room) {
      room.photos.push(photoUrl);
      await room.save();
    }
    
    socketController.broadcastNewPhoto(roomName, photoUrl, filename);
    res.json({ success: true, url: photoUrl });
  } catch (err) {
    console.error('Error saving uploaded video:', err);
    res.status(500).json({ error: 'Lỗi lưu dữ liệu video.' });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const roomName = (req.params.roomName || '').toLowerCase().trim();
    const room = await Room.findOne({ name: roomName });
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    }
    
    if (room.overlayUrl && room.overlayUrl.includes('/merged-')) {
      const oldPath = path.join(publicDir, room.overlayUrl);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.error('Failed to delete merged overlay file during deletion:', err);
        }
      }
    }

    // Clean up layer files
    if (room.layers && room.layers.length > 0) {
      for (const layer of room.layers) {
        if (layer.url) {
          await deleteLocalLayerFile(layer.url, room._id);
        }
      }
    }
    
    const roomPhotoDir = path.join(photoDir, roomName);
    if (fs.existsSync(roomPhotoDir)) {
      try {
        fs.rmSync(roomPhotoDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to clean room directory ${roomPhotoDir}:`, err);
      }
    }
    
    await Room.deleteOne({ name: roomName });
    
    socketController.syncAgentRooms();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting room:', err);
    res.status(500).json({ error: 'Lỗi xóa phòng chụp.' });
  }
};

exports.triggerCapture = async (req, res) => {
  try {
    const roomName = (req.params.roomName || '').toLowerCase().trim();
    const { mode, action } = req.body;
    
    const room = await Room.findOne({ name: roomName });
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    }
    
    const countdown = room.autoCaptureInterval || 10;
    const overlayUrl = room.overlayUrl || '';
    
    console.log(`REST Triggered capture command for room: ${roomName}, mode: ${mode}, action: ${action}`);
    socketController.triggerCaptureRemote(roomName, mode || 'photo', countdown, overlayUrl, action);
    
    res.json({ success: true, message: 'Đã gửi tín hiệu.' });
  } catch (err) {
    console.error('Error triggering capture:', err);
    res.status(500).json({ error: 'Lỗi kích hoạt từ xa.' });
  }
};
